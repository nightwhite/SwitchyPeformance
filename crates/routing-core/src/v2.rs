use std::collections::BTreeMap;

use config_model::{
    V2AutoSwitchProfile, V2Configuration, V2Profile, V2RouteTarget, V2RuleCondition, V2SwitchRule,
};
use thiserror::Error;

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

    let kind = if pattern.starts_with("*.") {
        HostPatternKind::Suffix
    } else {
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
