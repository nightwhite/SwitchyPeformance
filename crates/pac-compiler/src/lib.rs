#![forbid(unsafe_code)]

mod v2;

pub use v2::{V2PacCompileError, compile_v2_auto_switch_pac};

use std::collections::BTreeMap;

use config_model::{
    Configuration, LoopbackPolicy, ProxyEndpoint, ProxyFailurePolicy, ProxyScheme, RouteTarget,
    RuleCondition,
};
use routing_core::{AutoSwitchProgram, ProgramRule, ProgramStep, RoutingCompileError, RoutingPlan};
use serde_json::json;
use thiserror::Error;

pub fn compile_auto_switch_pac(configuration: &Configuration) -> Result<String, PacCompileError> {
    let plan = RoutingPlan::compile(configuration)?;
    let program = plan
        .auto_switch_program()
        .ok_or(PacCompileError::ActiveProfileIsNotAutoSwitch)?;
    let proxy_by_id = configuration
        .proxies
        .iter()
        .map(|proxy| (proxy.id.as_str(), proxy))
        .collect::<BTreeMap<_, _>>();

    render_program(&program, &proxy_by_id)
}

fn render_program(
    program: &AutoSwitchProgram,
    proxy_by_id: &BTreeMap<&str, &ProxyEndpoint>,
) -> Result<String, PacCompileError> {
    let mut source = String::from(
        "function _spMatch(h,e,s){var b=e[h]||null;var v=h;while(true){var c=s[v];if(c&&(!b||c[0]<b[0]))b=c;var d=v.indexOf('.');if(d<0)break;v=v.slice(d+1);}return b?b[1]:'';}\n",
    );
    let mut body = String::new();
    let mut index_number = 0;

    for step in &program.steps {
        match step {
            ProgramStep::Indexed { exact, suffix } => {
                let exact_name = format!("_spE{index_number}");
                let suffix_name = format!("_spS{index_number}");
                source.push_str("var ");
                source.push_str(&exact_name);
                source.push('=');
                source.push_str(&render_index(
                    exact,
                    proxy_by_id,
                    &program.proxy_failure_policy,
                )?);
                source.push_str(";var ");
                source.push_str(&suffix_name);
                source.push('=');
                source.push_str(&render_index(
                    suffix,
                    proxy_by_id,
                    &program.proxy_failure_policy,
                )?);
                source.push_str(";\n");
                body.push_str("var r");
                body.push_str(&index_number.to_string());
                body.push_str("=_spMatch(host,");
                body.push_str(&exact_name);
                body.push(',');
                body.push_str(&suffix_name);
                body.push_str(");if(r");
                body.push_str(&index_number.to_string());
                body.push_str(")return r");
                body.push_str(&index_number.to_string());
                body.push_str(";\n");
                index_number += 1;
            }
            ProgramStep::Complex {
                condition, target, ..
            } => {
                let condition = render_complex_condition(condition)?;
                let route = json_string(&proxy_directive(
                    target,
                    proxy_by_id,
                    &program.proxy_failure_policy,
                )?)?;
                body.push_str("if(");
                body.push_str(&condition);
                body.push_str(")return ");
                body.push_str(&route);
                body.push_str(";\n");
            }
        }
    }

    source.push_str("function FindProxyForURL(url, host){host=(host||'').toLowerCase();\n");
    if program.loopback_policy == LoopbackPolicy::Direct {
        source.push_str(
            "if(host==='localhost'||host.slice(-10)==='.localhost'||host==='::1'||host==='[::1]'||host.indexOf('127.')===0)return 'DIRECT';\n",
        );
    }
    source.push_str(&body);
    source.push_str("return ");
    source.push_str(&json_string(&proxy_directive(
        &program.fallback,
        proxy_by_id,
        &program.proxy_failure_policy,
    )?)?);
    source.push_str(";\n}\n");
    Ok(source)
}

fn render_index(
    rules: &[ProgramRule],
    proxy_by_id: &BTreeMap<&str, &ProxyEndpoint>,
    proxy_failure_policy: &ProxyFailurePolicy,
) -> Result<String, PacCompileError> {
    let mut entries = BTreeMap::new();
    for rule in rules {
        entries.insert(
            rule.pattern.clone(),
            json!([
                rule.ordinal,
                proxy_directive(&rule.target, proxy_by_id, proxy_failure_policy)?
            ]),
        );
    }
    Ok(serde_json::to_string(&entries)?)
}

fn render_complex_condition(condition: &RuleCondition) -> Result<String, PacCompileError> {
    match condition {
        RuleCondition::UrlGlob(pattern) => Ok(format!("shExpMatch(url,{})", json_string(pattern)?)),
        RuleCondition::HostEquals(_) | RuleCondition::HostSuffix(_) => {
            Err(PacCompileError::UnexpectedIndexedCondition)
        }
    }
}

fn proxy_directive(
    target: &RouteTarget,
    proxy_by_id: &BTreeMap<&str, &ProxyEndpoint>,
    proxy_failure_policy: &ProxyFailurePolicy,
) -> Result<String, PacCompileError> {
    match target {
        RouteTarget::Direct => Ok("DIRECT".to_owned()),
        RouteTarget::System => Err(PacCompileError::SystemRouteInAutoSwitch),
        RouteTarget::Proxy { proxy_id } => {
            let proxy = proxy_by_id
                .get(proxy_id.as_str())
                .ok_or_else(|| PacCompileError::MissingProxy(proxy_id.clone()))?;
            Ok(format!(
                "{} {}:{}{}",
                pac_scheme(&proxy.scheme),
                proxy.host,
                proxy.port,
                match proxy_failure_policy {
                    ProxyFailurePolicy::Direct => "; DIRECT",
                    ProxyFailurePolicy::Block => "",
                }
            ))
        }
    }
}

fn pac_scheme(scheme: &ProxyScheme) -> &'static str {
    match scheme {
        ProxyScheme::Http => "PROXY",
        ProxyScheme::Https => "HTTPS",
        ProxyScheme::Socks4 => "SOCKS4",
        ProxyScheme::Socks5 => "SOCKS5",
    }
}

fn json_string(value: &str) -> Result<String, PacCompileError> {
    Ok(serde_json::to_string(value)?)
}

#[derive(Debug, Error)]
pub enum PacCompileError {
    #[error("路由编译失败：{0}")]
    Routing(#[from] RoutingCompileError),
    #[error("当前配置不是自动切换")]
    ActiveProfileIsNotAutoSwitch,
    #[error("自动切换不能在 PAC 规则中使用系统代理")]
    SystemRouteInAutoSwitch,
    #[error("引用的代理不存在：{0}")]
    MissingProxy(String),
    #[error("简单主机条件进入了复杂 PAC 渲染器")]
    UnexpectedIndexedCondition,
    #[error("PAC 序列化失败：{0}")]
    Json(#[from] serde_json::Error),
}
