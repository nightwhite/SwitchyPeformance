#![forbid(unsafe_code)]

mod matcher;
mod v2;

pub use matcher::{
    ConditionMatch, matches_bypass_pattern, matches_glob, matches_host_suffix, matches_ip_cidr,
    matches_time_range, matches_weekdays,
};
pub use v2::{
    V2AutoSwitchProgram, V2DecisionReason, V2IndexedRule, V2ProgramStep, V2RouteDecision,
    V2RouteDestination, V2RouteRequest, V2RouteWarning, V2RoutingCompileError, V2RoutingMetrics,
    compile_v2_auto_switch_program, route_v2_auto_switch,
};

use std::{cmp::Ordering, collections::BTreeMap, net::IpAddr, str::FromStr};

use config_model::{
    AutoSwitchProfile, Configuration, ConfigurationError, LoopbackPolicy, Profile,
    ProxyFailurePolicy, RouteTarget, Rule, RuleCondition,
};
use thiserror::Error;
use url::Url;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RouteDecision {
    pub route: RouteTarget,
    pub matched_rule_id: Option<String>,
    pub reason: DecisionReason,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DecisionReason {
    FixedProfile,
    IndexedRule,
    ComplexRule,
    LoopbackDefault,
    ProfileDefault,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct RoutingMetrics {
    pub simple_rule_count: usize,
    pub complex_rule_count: usize,
    pub index_block_count: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AutoSwitchProgram {
    pub loopback_policy: LoopbackPolicy,
    pub proxy_failure_policy: ProxyFailurePolicy,
    pub fallback: RouteTarget,
    pub steps: Vec<ProgramStep>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProgramStep {
    Indexed {
        exact: Vec<ProgramRule>,
        suffix: Vec<ProgramRule>,
    },
    Complex {
        id: String,
        condition: RuleCondition,
        target: RouteTarget,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProgramRule {
    pub pattern: String,
    pub ordinal: usize,
    pub id: String,
    pub target: RouteTarget,
}

#[derive(Clone, Debug)]
pub struct RoutingPlan {
    active: ActivePlan,
    metrics: RoutingMetrics,
}

#[derive(Clone, Debug)]
enum ActivePlan {
    Direct,
    System,
    FixedProxy(RouteTarget),
    AutoSwitch(AutoSwitchPlan),
}

#[derive(Clone, Debug)]
struct AutoSwitchPlan {
    loopback_policy: LoopbackPolicy,
    proxy_failure_policy: ProxyFailurePolicy,
    fallback: RouteTarget,
    steps: Vec<PlanStep>,
}

#[derive(Clone, Debug)]
enum PlanStep {
    Indexed(HostIndex),
    Complex(CompiledRule),
}

#[derive(Clone, Debug, Default)]
struct HostIndex {
    exact: BTreeMap<String, IndexedRule>,
    suffix: BTreeMap<String, IndexedRule>,
}

#[derive(Clone, Debug)]
struct IndexedRule {
    ordinal: usize,
    id: String,
    target: RouteTarget,
}

#[derive(Clone, Debug)]
struct CompiledRule {
    id: String,
    condition: RuleCondition,
    target: RouteTarget,
}

impl RoutingPlan {
    pub fn compile(configuration: &Configuration) -> Result<Self, RoutingCompileError> {
        configuration.validate()?;

        let profile = configuration
            .profiles
            .iter()
            .find(|profile| profile.id() == configuration.active_profile_id)
            .ok_or_else(|| {
                RoutingCompileError::MissingActiveProfile(configuration.active_profile_id.clone())
            })?;

        match profile {
            Profile::Direct(_) => Ok(Self {
                active: ActivePlan::Direct,
                metrics: RoutingMetrics::default(),
            }),
            Profile::System(_) => Ok(Self {
                active: ActivePlan::System,
                metrics: RoutingMetrics::default(),
            }),
            Profile::FixedProxy(profile) => Ok(Self {
                active: ActivePlan::FixedProxy(RouteTarget::Proxy {
                    proxy_id: profile.proxy_id.clone(),
                }),
                metrics: RoutingMetrics::default(),
            }),
            Profile::AutoSwitch(profile) => Ok(compile_auto_switch(profile)),
        }
    }

    pub fn route(&self, raw_url: &str) -> RouteDecision {
        let parsed = Url::parse(raw_url).ok();
        let host = parsed
            .as_ref()
            .and_then(Url::host_str)
            .map(str::to_ascii_lowercase);

        match &self.active {
            ActivePlan::Direct => fixed_decision(RouteTarget::Direct),
            ActivePlan::System => fixed_decision(RouteTarget::System),
            ActivePlan::FixedProxy(target) => fixed_decision(target.clone()),
            ActivePlan::AutoSwitch(plan) => route_auto_switch(plan, raw_url, host.as_deref()),
        }
    }

    pub fn metrics(&self) -> RoutingMetrics {
        self.metrics
    }

    pub fn auto_switch_program(&self) -> Option<AutoSwitchProgram> {
        match &self.active {
            ActivePlan::AutoSwitch(plan) => Some(export_program(plan)),
            ActivePlan::Direct | ActivePlan::System | ActivePlan::FixedProxy(_) => None,
        }
    }
}

fn compile_auto_switch(profile: &AutoSwitchProfile) -> RoutingPlan {
    let mut metrics = RoutingMetrics::default();
    let mut steps = Vec::new();
    let mut index = HostIndex::default();

    for (ordinal, rule) in profile.rules.iter().filter(|rule| rule.enabled).enumerate() {
        match &rule.condition {
            RuleCondition::HostEquals(host) => {
                metrics.simple_rule_count += 1;
                index.insert_exact(host, indexed_rule(rule, ordinal));
            }
            RuleCondition::HostSuffix(suffix) => {
                metrics.simple_rule_count += 1;
                index.insert_suffix(suffix, indexed_rule(rule, ordinal));
            }
            RuleCondition::UrlGlob(_) => {
                flush_index(&mut steps, &mut index, &mut metrics);
                metrics.complex_rule_count += 1;
                steps.push(PlanStep::Complex(CompiledRule {
                    id: rule.id.clone(),
                    condition: rule.condition.clone(),
                    target: rule.target.clone(),
                }));
            }
        }
    }
    flush_index(&mut steps, &mut index, &mut metrics);

    RoutingPlan {
        active: ActivePlan::AutoSwitch(AutoSwitchPlan {
            loopback_policy: profile.loopback_policy.clone(),
            proxy_failure_policy: profile.proxy_failure_policy.clone(),
            fallback: profile.fallback.clone(),
            steps,
        }),
        metrics,
    }
}

fn indexed_rule(rule: &Rule, ordinal: usize) -> IndexedRule {
    IndexedRule {
        ordinal,
        id: rule.id.clone(),
        target: rule.target.clone(),
    }
}

fn flush_index(steps: &mut Vec<PlanStep>, index: &mut HostIndex, metrics: &mut RoutingMetrics) {
    if index.is_empty() {
        return;
    }
    metrics.index_block_count += 1;
    steps.push(PlanStep::Indexed(std::mem::take(index)));
}

fn route_auto_switch(plan: &AutoSwitchPlan, raw_url: &str, host: Option<&str>) -> RouteDecision {
    if plan.loopback_policy == LoopbackPolicy::Direct && host.is_some_and(is_loopback_host) {
        return RouteDecision {
            route: RouteTarget::Direct,
            matched_rule_id: None,
            reason: DecisionReason::LoopbackDefault,
        };
    }

    for step in &plan.steps {
        match step {
            PlanStep::Indexed(index) => {
                if let Some(rule) = host.and_then(|value| index.matches(value)) {
                    return RouteDecision {
                        route: rule.target.clone(),
                        matched_rule_id: Some(rule.id.clone()),
                        reason: DecisionReason::IndexedRule,
                    };
                }
            }
            PlanStep::Complex(rule) if matches_complex_rule(&rule.condition, raw_url) => {
                return RouteDecision {
                    route: rule.target.clone(),
                    matched_rule_id: Some(rule.id.clone()),
                    reason: DecisionReason::ComplexRule,
                };
            }
            PlanStep::Complex(_) => {}
        }
    }

    RouteDecision {
        route: plan.fallback.clone(),
        matched_rule_id: None,
        reason: DecisionReason::ProfileDefault,
    }
}

fn fixed_decision(route: RouteTarget) -> RouteDecision {
    RouteDecision {
        route,
        matched_rule_id: None,
        reason: DecisionReason::FixedProfile,
    }
}

fn export_program(plan: &AutoSwitchPlan) -> AutoSwitchProgram {
    let steps = plan
        .steps
        .iter()
        .map(|step| match step {
            PlanStep::Indexed(index) => ProgramStep::Indexed {
                exact: export_rules(&index.exact),
                suffix: export_rules(&index.suffix),
            },
            PlanStep::Complex(rule) => ProgramStep::Complex {
                id: rule.id.clone(),
                condition: rule.condition.clone(),
                target: rule.target.clone(),
            },
        })
        .collect();

    AutoSwitchProgram {
        loopback_policy: plan.loopback_policy.clone(),
        proxy_failure_policy: plan.proxy_failure_policy.clone(),
        fallback: plan.fallback.clone(),
        steps,
    }
}

fn export_rules(rules: &BTreeMap<String, IndexedRule>) -> Vec<ProgramRule> {
    rules
        .iter()
        .map(|(pattern, rule)| ProgramRule {
            pattern: pattern.clone(),
            ordinal: rule.ordinal,
            id: rule.id.clone(),
            target: rule.target.clone(),
        })
        .collect()
}

impl HostIndex {
    fn is_empty(&self) -> bool {
        self.exact.is_empty() && self.suffix.is_empty()
    }

    fn insert_exact(&mut self, host: &str, candidate: IndexedRule) {
        insert_earliest(&mut self.exact, normalize_host_pattern(host), candidate);
    }

    fn insert_suffix(&mut self, suffix: &str, candidate: IndexedRule) {
        insert_earliest(&mut self.suffix, normalize_host_pattern(suffix), candidate);
    }

    fn matches(&self, host: &str) -> Option<&IndexedRule> {
        let mut best = self.exact.get(host);
        let mut suffix = host;

        loop {
            best = earliest_rule(best, self.suffix.get(suffix));
            let Some((_, parent)) = suffix.split_once('.') else {
                break;
            };
            suffix = parent;
        }

        best
    }
}

fn normalize_host_pattern(value: &str) -> String {
    value
        .trim()
        .trim_start_matches("*.")
        .trim_start_matches('.')
        .to_ascii_lowercase()
}

fn insert_earliest(rules: &mut BTreeMap<String, IndexedRule>, key: String, candidate: IndexedRule) {
    match rules.get(&key) {
        Some(existing) if existing.ordinal <= candidate.ordinal => {}
        _ => {
            rules.insert(key, candidate);
        }
    }
}

fn earliest_rule<'a>(
    left: Option<&'a IndexedRule>,
    right: Option<&'a IndexedRule>,
) -> Option<&'a IndexedRule> {
    match (left, right) {
        (Some(left), Some(right)) if left.ordinal.cmp(&right.ordinal) == Ordering::Greater => {
            Some(right)
        }
        (Some(left), _) => Some(left),
        (_, Some(right)) => Some(right),
        (None, None) => None,
    }
}

fn is_loopback_host(host: &str) -> bool {
    host == "localhost"
        || host.ends_with(".localhost")
        || IpAddr::from_str(host).is_ok_and(|address| address.is_loopback())
}

fn matches_complex_rule(condition: &RuleCondition, raw_url: &str) -> bool {
    match condition {
        RuleCondition::UrlGlob(pattern) => matches_glob(pattern, raw_url),
        RuleCondition::HostEquals(_) | RuleCondition::HostSuffix(_) => false,
    }
}

#[derive(Debug, Error)]
pub enum RoutingCompileError {
    #[error("配置校验失败：{0}")]
    Configuration(#[from] ConfigurationError),
    #[error("编译过程中当前配置消失：{0}")]
    MissingActiveProfile(String),
}
