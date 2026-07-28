use std::collections::BTreeMap;

use config_model::{
    V2AutoSwitchProfile, V2Configuration, V2Profile, V2RouteTarget, V2RuleCondition, V2SwitchRule,
};
use regex_lite::Regex;
use thiserror::Error;
use url::Url;

use crate::{
    ConditionMatch, matches_bypass_pattern, matches_glob, matches_host_suffix, matches_ip_cidr,
    matches_time_range, matches_weekdays,
};

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct V2RoutingMetrics {
    pub indexed_rule_count: usize,
    pub complex_rule_count: usize,
    pub index_block_count: usize,
    pub dns_sensitive_rule_count: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct V2AutoSwitchProgram {
    pub loopback_policy: String,
    pub proxy_failure_policy: String,
    pub fallback: V2RouteTarget,
    pub steps: Vec<V2ProgramStep>,
    pub metrics: V2RoutingMetrics,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum V2ProgramStep {
    Indexed {
        exact: Vec<V2IndexedRule>,
        suffix: Vec<V2IndexedRule>,
    },
    Complex {
        id: String,
        ordinal: usize,
        condition: V2RuleCondition,
        target: V2RouteTarget,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct V2IndexedRule {
    pub id: String,
    pub ordinal: usize,
    pub pattern: String,
    pub target: V2RouteTarget,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct V2RouteRequest<'a> {
    pub url: &'a str,
    /// Matches JavaScript `Date#getDay`: Sunday is 0 and Saturday is 6.
    pub weekday: u8,
    /// Browser-local minute of day, from 0 through 1,439.
    pub minute_of_day: u16,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum V2RouteDestination {
    Direct,
    Profile(V2RouteTarget),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct V2RouteDecision {
    pub destination: V2RouteDestination,
    pub matched_rule_id: Option<String>,
    pub pending_rule_id: Option<String>,
    pub reason: V2DecisionReason,
    pub warnings: Vec<V2RouteWarning>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum V2DecisionReason {
    IndexedRule,
    ComplexRule,
    BrowserLoopbackDirect,
    ProfileDefault,
    RequiresPacDns,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum V2RouteWarning {
    RequiresPacDns,
    PacUrlMayBeSanitized,
    UnsupportedRegex,
}

impl V2RouteWarning {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::RequiresPacDns => "requires-pac-dns",
            Self::PacUrlMayBeSanitized => "pac-url-may-be-sanitized",
            Self::UnsupportedRegex => "unsupported-regex",
        }
    }
}

pub fn compile_v2_auto_switch_program(
    configuration: &V2Configuration,
) -> Result<V2AutoSwitchProgram, V2RoutingCompileError> {
    if configuration.schema_version != 2 {
        return Err(V2RoutingCompileError::UnsupportedSchemaVersion(
            configuration.schema_version,
        ));
    }

    let active = configuration
        .profiles
        .iter()
        .find(|profile| profile_id(profile) == configuration.active_profile_id)
        .ok_or_else(|| {
            V2RoutingCompileError::MissingProfile(configuration.active_profile_id.clone())
        })?;
    let V2Profile::AutoSwitch(profile) = active else {
        return Err(V2RoutingCompileError::ActiveProfileIsNotAutoSwitch);
    };

    Ok(compile_auto_switch(profile))
}

pub fn route_v2_auto_switch(
    program: &V2AutoSwitchProgram,
    request: V2RouteRequest<'_>,
) -> V2RouteDecision {
    let parsed_url = Url::parse(request.url).ok();
    let host = parsed_url
        .as_ref()
        .and_then(Url::host_str)
        .map(str::to_ascii_lowercase);

    if program.loopback_policy != "use-rules" && host.as_deref().is_some_and(is_chrome_pac_loopback)
    {
        return V2RouteDecision {
            destination: V2RouteDestination::Direct,
            matched_rule_id: None,
            pending_rule_id: None,
            reason: V2DecisionReason::BrowserLoopbackDirect,
            warnings: Vec::new(),
        };
    }

    let mut warnings = Vec::new();
    for step in &program.steps {
        match step {
            V2ProgramStep::Indexed { exact, suffix } => {
                if let Some(rule) = host
                    .as_deref()
                    .and_then(|value| indexed_rule_match(exact, suffix, value))
                {
                    return V2RouteDecision {
                        destination: V2RouteDestination::Profile(rule.target.clone()),
                        matched_rule_id: Some(rule.id.clone()),
                        pending_rule_id: None,
                        reason: V2DecisionReason::IndexedRule,
                        warnings,
                    };
                }
            }
            V2ProgramStep::Complex {
                id,
                condition,
                target,
                ..
            } => {
                let result = evaluate_condition(
                    condition,
                    request.url,
                    host.as_deref(),
                    request.weekday,
                    request.minute_of_day,
                );
                extend_unique(&mut warnings, result.warnings);
                match result.outcome {
                    V2ConditionOutcome::Match => {
                        return V2RouteDecision {
                            destination: V2RouteDestination::Profile(target.clone()),
                            matched_rule_id: Some(id.clone()),
                            pending_rule_id: None,
                            reason: V2DecisionReason::ComplexRule,
                            warnings,
                        };
                    }
                    V2ConditionOutcome::RequiresPacDns => {
                        extend_unique(&mut warnings, vec![V2RouteWarning::RequiresPacDns]);
                        return V2RouteDecision {
                            destination: V2RouteDestination::Profile(target.clone()),
                            matched_rule_id: None,
                            pending_rule_id: Some(id.clone()),
                            reason: V2DecisionReason::RequiresPacDns,
                            warnings,
                        };
                    }
                    V2ConditionOutcome::NoMatch => {}
                }
            }
        }
    }

    V2RouteDecision {
        destination: V2RouteDestination::Profile(program.fallback.clone()),
        matched_rule_id: None,
        pending_rule_id: None,
        reason: V2DecisionReason::ProfileDefault,
        warnings,
    }
}

fn indexed_rule_match<'a>(
    exact: &'a [V2IndexedRule],
    suffix: &'a [V2IndexedRule],
    host: &str,
) -> Option<&'a V2IndexedRule> {
    let exact_match = exact.iter().find(|rule| rule.pattern == host);
    let suffix_match = suffix
        .iter()
        .filter(|rule| matches_host_suffix(host, &rule.pattern))
        .min_by_key(|rule| rule.ordinal);

    match (exact_match, suffix_match) {
        (Some(left), Some(right)) if left.ordinal > right.ordinal => Some(right),
        (Some(left), _) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    }
}

fn is_chrome_pac_loopback(host: &str) -> bool {
    host == "localhost"
        || host.ends_with(".localhost")
        || host == "0.0.0.0"
        || host == "::"
        || host == "[::]"
        || host == "::1"
        || host == "[::1]"
        || host.starts_with("127.")
}

enum V2ConditionOutcome {
    Match,
    NoMatch,
    RequiresPacDns,
}

struct V2ConditionEvaluation {
    outcome: V2ConditionOutcome,
    warnings: Vec<V2RouteWarning>,
}

fn evaluate_condition(
    condition: &V2RuleCondition,
    raw_url: &str,
    host: Option<&str>,
    weekday: u8,
    minute_of_day: u16,
) -> V2ConditionEvaluation {
    match condition {
        V2RuleCondition::HostWildcard { pattern } => evaluation(matches_glob(
            &pattern.to_ascii_lowercase(),
            host.unwrap_or_default(),
        )),
        V2RuleCondition::HostRegex { pattern } => {
            regex_evaluation(pattern, host.unwrap_or_default())
        }
        V2RuleCondition::HostLevels { min, max } => {
            let levels = host.map(host_level_count).unwrap_or(0);
            evaluation(levels >= *min && max.is_none_or(|value| levels <= value))
        }
        V2RuleCondition::IpCidr {
            address,
            prefix_length,
        } => match host.map(|value| matches_ip_cidr(value, address, *prefix_length)) {
            Some(ConditionMatch::Match) => evaluation(true),
            Some(ConditionMatch::NoMatch) | None => evaluation(false),
            Some(ConditionMatch::RequiresPacDns) => V2ConditionEvaluation {
                outcome: V2ConditionOutcome::RequiresPacDns,
                warnings: Vec::new(),
            },
        },
        V2RuleCondition::UrlWildcard { pattern } => V2ConditionEvaluation {
            outcome: outcome(matches_glob(pattern, raw_url)),
            warnings: vec![V2RouteWarning::PacUrlMayBeSanitized],
        },
        V2RuleCondition::UrlRegex { pattern } => {
            let mut result = regex_evaluation(pattern, raw_url);
            extend_unique(
                &mut result.warnings,
                vec![V2RouteWarning::PacUrlMayBeSanitized],
            );
            result
        }
        V2RuleCondition::Keyword { value } => V2ConditionEvaluation {
            outcome: outcome(raw_url.contains(value)),
            warnings: vec![V2RouteWarning::PacUrlMayBeSanitized],
        },
        V2RuleCondition::Always => evaluation(true),
        V2RuleCondition::Bypass { pattern } => {
            evaluation(host.is_some_and(|value| matches_bypass_pattern(value, pattern)))
        }
        V2RuleCondition::TimeRange {
            start_minute,
            end_minute,
        } => evaluation(matches_time_range(
            minute_of_day,
            *start_minute,
            *end_minute,
        )),
        V2RuleCondition::Weekday { days } => evaluation(matches_weekdays(weekday, days)),
        V2RuleCondition::Never => evaluation(false),
    }
}

fn regex_evaluation(pattern: &str, value: &str) -> V2ConditionEvaluation {
    match Regex::new(pattern) {
        Ok(regex) => evaluation(regex.is_match(value)),
        Err(_) => V2ConditionEvaluation {
            outcome: V2ConditionOutcome::NoMatch,
            warnings: vec![V2RouteWarning::UnsupportedRegex],
        },
    }
}

fn evaluation(matches: bool) -> V2ConditionEvaluation {
    V2ConditionEvaluation {
        outcome: outcome(matches),
        warnings: Vec::new(),
    }
}

fn outcome(matches: bool) -> V2ConditionOutcome {
    if matches {
        V2ConditionOutcome::Match
    } else {
        V2ConditionOutcome::NoMatch
    }
}

fn host_level_count(host: &str) -> u16 {
    host.bytes().filter(|value| *value == b'.').count() as u16
}

fn extend_unique(target: &mut Vec<V2RouteWarning>, additions: Vec<V2RouteWarning>) {
    for warning in additions {
        if !target.contains(&warning) {
            target.push(warning);
        }
    }
}

fn compile_auto_switch(profile: &V2AutoSwitchProfile) -> V2AutoSwitchProgram {
    let mut metrics = V2RoutingMetrics::default();
    let mut steps = Vec::new();
    let mut index = V2HostIndex::default();

    for (ordinal, rule) in profile.rules.iter().filter(|rule| rule.enabled).enumerate() {
        if let Some((kind, pattern)) = indexable_host_pattern(&rule.condition) {
            metrics.indexed_rule_count += 1;
            let indexed = indexed_rule(rule, ordinal, pattern);
            match kind {
                HostPatternKind::Exact => index.insert_exact(indexed),
                HostPatternKind::Suffix => index.insert_suffix(indexed),
            }
            continue;
        }

        flush_index(&mut steps, &mut index, &mut metrics);
        if matches!(rule.condition, V2RuleCondition::Never) {
            continue;
        }
        if matches!(rule.condition, V2RuleCondition::IpCidr { .. }) {
            metrics.dns_sensitive_rule_count += 1;
        }
        metrics.complex_rule_count += 1;
        steps.push(V2ProgramStep::Complex {
            id: rule.id.clone(),
            ordinal,
            condition: rule.condition.clone(),
            target: rule.target.clone(),
        });
    }
    flush_index(&mut steps, &mut index, &mut metrics);

    V2AutoSwitchProgram {
        loopback_policy: profile.loopback_policy.clone(),
        proxy_failure_policy: profile.proxy_failure_policy.clone(),
        fallback: profile.fallback.clone(),
        steps,
        metrics,
    }
}

#[derive(Clone, Copy)]
enum HostPatternKind {
    Exact,
    Suffix,
}

fn indexable_host_pattern(condition: &V2RuleCondition) -> Option<(HostPatternKind, String)> {
    let V2RuleCondition::HostWildcard { pattern } = condition else {
        return None;
    };
    let pattern = pattern.trim();
    if pattern == "*" || pattern.is_empty() {
        return None;
    }

    let kind = if let Some(suffix) = pattern.strip_prefix("*.") {
        if suffix.is_empty() || suffix.contains(['*', '?']) {
            return None;
        }
        HostPatternKind::Suffix
    } else {
        if pattern.contains(['*', '?']) {
            return None;
        }
        HostPatternKind::Exact
    };
    Some((kind, normalize_host_pattern(pattern)))
}

fn normalize_host_pattern(value: &str) -> String {
    value
        .trim()
        .trim_start_matches("*.")
        .trim_start_matches('.')
        .to_ascii_lowercase()
}

fn indexed_rule(rule: &V2SwitchRule, ordinal: usize, pattern: String) -> V2IndexedRule {
    V2IndexedRule {
        id: rule.id.clone(),
        ordinal,
        pattern,
        target: rule.target.clone(),
    }
}

fn flush_index(
    steps: &mut Vec<V2ProgramStep>,
    index: &mut V2HostIndex,
    metrics: &mut V2RoutingMetrics,
) {
    if index.is_empty() {
        return;
    }
    metrics.index_block_count += 1;
    steps.push(V2ProgramStep::Indexed {
        exact: std::mem::take(&mut index.exact).into_values().collect(),
        suffix: std::mem::take(&mut index.suffix).into_values().collect(),
    });
}

#[derive(Default)]
struct V2HostIndex {
    exact: BTreeMap<String, V2IndexedRule>,
    suffix: BTreeMap<String, V2IndexedRule>,
}

impl V2HostIndex {
    fn is_empty(&self) -> bool {
        self.exact.is_empty() && self.suffix.is_empty()
    }

    fn insert_exact(&mut self, candidate: V2IndexedRule) {
        insert_earliest(&mut self.exact, candidate);
    }

    fn insert_suffix(&mut self, candidate: V2IndexedRule) {
        insert_earliest(&mut self.suffix, candidate);
    }
}

fn insert_earliest(index: &mut BTreeMap<String, V2IndexedRule>, candidate: V2IndexedRule) {
    match index.get(&candidate.pattern) {
        Some(existing) if existing.ordinal <= candidate.ordinal => {}
        _ => {
            index.insert(candidate.pattern.clone(), candidate);
        }
    }
}

fn profile_id(profile: &V2Profile) -> &str {
    match profile {
        V2Profile::Direct(value) | V2Profile::System(value) | V2Profile::AutoDetect(value) => {
            &value.id
        }
        V2Profile::FixedProxy(value) => &value.id,
        V2Profile::Pac(value) => &value.id,
        V2Profile::AutoSwitch(value) => &value.id,
        V2Profile::RuleList(value) => &value.id,
        V2Profile::Virtual(value) => &value.id,
    }
}

#[derive(Debug, Error, Eq, PartialEq)]
pub enum V2RoutingCompileError {
    #[error("不支持的 V2 配置版本：{0}")]
    UnsupportedSchemaVersion(u32),
    #[error("未知配置：{0}")]
    MissingProfile(String),
    #[error("当前配置不是自动切换")]
    ActiveProfileIsNotAutoSwitch,
}
