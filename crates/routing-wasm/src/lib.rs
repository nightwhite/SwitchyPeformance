#![forbid(unsafe_code)]

use config_model::{Configuration, RouteTarget, V2Configuration};
use pac_compiler::{
    PacCompileError, V2PacCompileError, compile_auto_switch_pac,
    compile_v2_auto_switch_pac_from_program,
};
use routing_core::{
    DecisionReason, RoutingCompileError, RoutingPlan, V2RoutingCompileError,
    compile_v2_auto_switch_program,
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

#[wasm_bindgen]
pub fn compile_auto_switch_json(configuration_json: &str) -> Result<String, JsValue> {
    let result = compile_configuration_json(configuration_json).map_err(as_js_error)?;
    serde_json::to_string(&result).map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen]
pub fn explain_route_json(configuration_json: &str, url: &str) -> Result<String, JsValue> {
    explain_route_configuration_json(configuration_json, url).map_err(as_js_error)
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
}
