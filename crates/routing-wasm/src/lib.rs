#![forbid(unsafe_code)]

use std::collections::BTreeSet;

use config_model::{Configuration, RouteTarget, V2Configuration, V2Profile};
use pac_compiler::{
    PacCompileError, V2PacCompileError, compile_auto_switch_pac,
    compile_v2_auto_switch_pac_from_program,
};
use routing_core::{
    DecisionReason, RoutingCompileError, RoutingPlan, V2DecisionReason, V2RouteDestination,
    V2RouteRequest, V2RoutingCompileError, compile_v2_auto_switch_program, route_v2_auto_switch,
};
use serde::Serialize;
use thiserror::Error;
use wasm_bindgen::prelude::*;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct CompileConfigurationResult {
    pub pac_source: String,
    pub simple_rule_count: usize,
    pub complex_rule_count: usize,
    pub index_block_count: usize,
    pub dns_sensitive_rule_count: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteExplanation {
    pub route: RouteTarget,
    pub matched_rule_id: Option<String>,
    pub reason: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2RouteExplanationMetrics {
    pub indexed_rule_count: usize,
    pub complex_rule_count: usize,
    pub index_block_count: usize,
    pub dns_sensitive_rule_count: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2RouteExplanation {
    pub active_profile_id: String,
    pub active_resolved_profile_id: String,
    pub route_profile_id: Option<String>,
    pub resolved_route_profile_id: Option<String>,
    pub route_kind: String,
    pub matched_rule_id: Option<String>,
    pub pending_rule_id: Option<String>,
    pub reason: String,
    pub definitive: bool,
    pub warnings: Vec<String>,
    pub metrics: V2RouteExplanationMetrics,
}

pub fn compile_configuration_json(
    configuration_json: &str,
) -> Result<CompileConfigurationResult, CompileConfigurationError> {
    let schema_version = read_schema_version(configuration_json)?;
    match schema_version {
        1 => compile_v1_configuration_json(configuration_json),
        2 => compile_v2_configuration_json(configuration_json),
        version => Err(CompileConfigurationError::UnsupportedSchemaVersion(version)),
    }
}

fn compile_v1_configuration_json(
    configuration_json: &str,
) -> Result<CompileConfigurationResult, CompileConfigurationError> {
    let configuration: Configuration = serde_json::from_str(configuration_json)?;
    let plan = RoutingPlan::compile(&configuration)?;
    let pac_source = compile_auto_switch_pac(&configuration)?;
    let metrics = plan.metrics();

    Ok(CompileConfigurationResult {
        pac_source,
        simple_rule_count: metrics.simple_rule_count,
        complex_rule_count: metrics.complex_rule_count,
        index_block_count: metrics.index_block_count,
        dns_sensitive_rule_count: 0,
    })
}

fn compile_v2_configuration_json(
    configuration_json: &str,
) -> Result<CompileConfigurationResult, CompileConfigurationError> {
    let configuration: V2Configuration = serde_json::from_str(configuration_json)?;
    let program = compile_v2_auto_switch_program(&configuration)?;
    let pac_source = compile_v2_auto_switch_pac_from_program(&configuration, &program)?;
    let metrics = program.metrics;

    Ok(CompileConfigurationResult {
        pac_source,
        simple_rule_count: metrics.indexed_rule_count,
        complex_rule_count: metrics.complex_rule_count,
        index_block_count: metrics.index_block_count,
        dns_sensitive_rule_count: metrics.dns_sensitive_rule_count,
    })
}

pub fn explain_route_configuration_json(
    configuration_json: &str,
    url: &str,
) -> Result<String, CompileConfigurationError> {
    let configuration: Configuration = serde_json::from_str(configuration_json)?;
    let plan = RoutingPlan::compile(&configuration)?;
    let decision = plan.route(url);
    let explanation = RouteExplanation {
        route: decision.route,
        matched_rule_id: decision.matched_rule_id,
        reason: reason_name(&decision.reason).to_owned(),
    };
    Ok(serde_json::to_string(&explanation)?)
}

pub fn explain_v2_route_configuration_json(
    configuration_json: &str,
    url: &str,
    weekday: u8,
    minute_of_day: u16,
) -> Result<String, CompileConfigurationError> {
    let configuration: V2Configuration = serde_json::from_str(configuration_json)?;
    if configuration.schema_version != 2 {
        return Err(CompileConfigurationError::UnsupportedSchemaVersion(
            configuration.schema_version.into(),
        ));
    }

    let active_profile_id = configuration.active_profile_id.clone();
    let active = resolve_v2_profile(&configuration, &active_profile_id)?;
    let explanation = match active.profile {
        V2Profile::AutoSwitch(_) => explain_v2_auto_switch(
            &configuration,
            &active_profile_id,
            active.profile_id,
            url,
            weekday,
            minute_of_day,
        )?,
        profile => static_v2_explanation(&active_profile_id, active.profile_id, profile),
    };
    Ok(serde_json::to_string(&explanation)?)
}

#[wasm_bindgen]
pub fn compile_auto_switch_json(configuration_json: &str) -> Result<String, JsValue> {
    let result = compile_configuration_json(configuration_json).map_err(as_js_error)?;
    serde_json::to_string(&result).map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen]
pub fn explain_route_json(configuration_json: &str, url: &str) -> Result<String, JsValue> {
    explain_route_configuration_json(configuration_json, url).map_err(as_js_error)
}

#[wasm_bindgen]
pub fn explain_v2_route_json(
    configuration_json: &str,
    url: &str,
    weekday: u8,
    minute_of_day: u16,
) -> Result<String, JsValue> {
    explain_v2_route_configuration_json(configuration_json, url, weekday, minute_of_day)
        .map_err(as_js_error)
}

fn as_js_error(error: CompileConfigurationError) -> JsValue {
    JsValue::from_str(&error.to_string())
}

fn read_schema_version(configuration_json: &str) -> Result<u64, CompileConfigurationError> {
    let value: serde_json::Value = serde_json::from_str(configuration_json)?;
    value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        .ok_or(CompileConfigurationError::MissingSchemaVersion)
}

fn reason_name(reason: &DecisionReason) -> &'static str {
    match reason {
        DecisionReason::FixedProfile => "fixed-profile",
        DecisionReason::IndexedRule => "indexed-rule",
        DecisionReason::ComplexRule => "complex-rule",
        DecisionReason::LoopbackDefault => "loopback-default",
        DecisionReason::ProfileDefault => "profile-default",
    }
}

fn explain_v2_auto_switch(
    configuration: &V2Configuration,
    active_profile_id: &str,
    active_resolved_profile_id: &str,
    url: &str,
    weekday: u8,
    minute_of_day: u16,
) -> Result<V2RouteExplanation, CompileConfigurationError> {
    let mut auto_switch_configuration = configuration.clone();
    auto_switch_configuration.active_profile_id = active_resolved_profile_id.to_owned();
    let program = compile_v2_auto_switch_program(&auto_switch_configuration)?;
    let decision = route_v2_auto_switch(
        &program,
        V2RouteRequest {
            url,
            weekday,
            minute_of_day,
        },
    );
    let mut warnings = decision
        .warnings
        .iter()
        .map(|warning| warning.as_str().to_owned())
        .collect::<Vec<_>>();
    let (route_profile_id, resolved_route_profile_id, route_kind) = match decision.destination {
        V2RouteDestination::Direct => {
            push_warning(&mut warnings, "chrome-loopback-direct");
            (None, None, "direct".to_owned())
        }
        V2RouteDestination::Profile(target) => {
            let resolved = resolve_v2_profile(configuration, &target.profile_id)?;
            let kind = profile_kind(resolved.profile).to_owned();
            if !matches!(
                resolved.profile,
                V2Profile::Direct(_) | V2Profile::FixedProxy(_)
            ) {
                push_warning(&mut warnings, "unsupported-auto-switch-target");
            }
            (
                Some(target.profile_id),
                Some(resolved.profile_id.to_owned()),
                kind,
            )
        }
    };

    Ok(V2RouteExplanation {
        active_profile_id: active_profile_id.to_owned(),
        active_resolved_profile_id: active_resolved_profile_id.to_owned(),
        route_profile_id,
        resolved_route_profile_id,
        route_kind,
        matched_rule_id: decision.matched_rule_id,
        pending_rule_id: decision.pending_rule_id,
        definitive: decision.reason != V2DecisionReason::RequiresPacDns,
        reason: v2_reason_name(&decision.reason).to_owned(),
        warnings,
        metrics: V2RouteExplanationMetrics {
            indexed_rule_count: program.metrics.indexed_rule_count,
            complex_rule_count: program.metrics.complex_rule_count,
            index_block_count: program.metrics.index_block_count,
            dns_sensitive_rule_count: program.metrics.dns_sensitive_rule_count,
        },
    })
}

fn static_v2_explanation(
    active_profile_id: &str,
    active_resolved_profile_id: &str,
    profile: &V2Profile,
) -> V2RouteExplanation {
    let mut warnings = Vec::new();
    if matches!(profile, V2Profile::RuleList(_)) {
        push_warning(&mut warnings, "rule-list-not-applied");
    }
    V2RouteExplanation {
        active_profile_id: active_profile_id.to_owned(),
        active_resolved_profile_id: active_resolved_profile_id.to_owned(),
        route_profile_id: Some(active_profile_id.to_owned()),
        resolved_route_profile_id: Some(active_resolved_profile_id.to_owned()),
        route_kind: profile_kind(profile).to_owned(),
        matched_rule_id: None,
        pending_rule_id: None,
        reason: "fixed-profile".to_owned(),
        definitive: true,
        warnings,
        metrics: V2RouteExplanationMetrics {
            indexed_rule_count: 0,
            complex_rule_count: 0,
            index_block_count: 0,
            dns_sensitive_rule_count: 0,
        },
    }
}

struct V2ProfileResolution<'a> {
    profile_id: &'a str,
    profile: &'a V2Profile,
}

fn resolve_v2_profile<'a>(
    configuration: &'a V2Configuration,
    initial_profile_id: &str,
) -> Result<V2ProfileResolution<'a>, CompileConfigurationError> {
    let mut profile_id = initial_profile_id.to_owned();
    let mut seen = BTreeSet::new();
    loop {
        if !seen.insert(profile_id.clone()) {
            return Err(CompileConfigurationError::V2VirtualProfileCycle(profile_id));
        }
        let profile = configuration
            .profiles
            .iter()
            .find(|candidate| profile_id_of(candidate) == profile_id)
            .ok_or_else(|| CompileConfigurationError::MissingV2Profile(profile_id.clone()))?;
        if let V2Profile::Virtual(virtual_profile) = profile {
            profile_id = virtual_profile.target.profile_id.clone();
            continue;
        }
        return Ok(V2ProfileResolution {
            profile_id: profile_id_of(profile),
            profile,
        });
    }
}

fn profile_id_of(profile: &V2Profile) -> &str {
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

fn profile_kind(profile: &V2Profile) -> &'static str {
    match profile {
        V2Profile::Direct(_) => "direct",
        V2Profile::System(_) => "system",
        V2Profile::FixedProxy(_) => "fixed-proxy",
        V2Profile::Pac(_) => "pac",
        V2Profile::AutoDetect(_) => "auto-detect",
        V2Profile::AutoSwitch(_) => "auto-switch",
        V2Profile::RuleList(_) => "rule-list",
        V2Profile::Virtual(_) => "virtual",
    }
}

fn v2_reason_name(reason: &V2DecisionReason) -> &'static str {
    match reason {
        V2DecisionReason::IndexedRule => "indexed-rule",
        V2DecisionReason::ComplexRule => "complex-rule",
        V2DecisionReason::BrowserLoopbackDirect => "browser-loopback-direct",
        V2DecisionReason::ProfileDefault => "profile-default",
        V2DecisionReason::RequiresPacDns => "requires-pac-dns",
    }
}

fn push_warning(warnings: &mut Vec<String>, warning: &str) {
    if !warnings.iter().any(|candidate| candidate == warning) {
        warnings.push(warning.to_owned());
    }
}

#[derive(Debug, Error)]
pub enum CompileConfigurationError {
    #[error("配置 JSON 无效：{0}")]
    ConfigurationJson(#[from] serde_json::Error),
    #[error("配置缺少 schemaVersion")]
    MissingSchemaVersion,
    #[error("不支持的配置版本：{0}")]
    UnsupportedSchemaVersion(u64),
    #[error("路由方案无效：{0}")]
    Routing(#[from] RoutingCompileError),
    #[error("V2 路由方案无效：{0}")]
    V2Routing(#[from] V2RoutingCompileError),
    #[error("PAC 编译失败：{0}")]
    Pac(#[from] PacCompileError),
    #[error("V2 PAC 编译失败：{0}")]
    V2Pac(#[from] V2PacCompileError),
    #[error("V2 当前配置不存在：{0}")]
    MissingV2Profile(String),
    #[error("V2 虚拟配置存在循环引用：{0}")]
    V2VirtualProfileCycle(String),
}
