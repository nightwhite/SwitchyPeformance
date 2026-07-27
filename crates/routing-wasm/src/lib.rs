#![forbid(unsafe_code)]

use config_model::{Configuration, RouteTarget};
use pac_compiler::{PacCompileError, compile_auto_switch_pac};
use routing_core::{DecisionReason, RoutingCompileError, RoutingPlan};
use serde::Serialize;
use thiserror::Error;
use wasm_bindgen::prelude::*;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct CompileConfigurationResult {
    pub pac_source: String,
    pub simple_rule_count: usize,
    pub complex_rule_count: usize,
    pub index_block_count: usize,
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
    let configuration: Configuration = serde_json::from_str(configuration_json)?;
    let plan = RoutingPlan::compile(&configuration)?;
    let pac_source = compile_auto_switch_pac(&configuration)?;
    let metrics = plan.metrics();

    Ok(CompileConfigurationResult {
        pac_source,
        simple_rule_count: metrics.simple_rule_count,
        complex_rule_count: metrics.complex_rule_count,
        index_block_count: metrics.index_block_count,
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
    #[error("configuration JSON is invalid: {0}")]
    ConfigurationJson(#[from] serde_json::Error),
    #[error("routing plan is invalid: {0}")]
    Routing(#[from] RoutingCompileError),
    #[error("PAC compilation failed: {0}")]
    Pac(#[from] PacCompileError),
}
