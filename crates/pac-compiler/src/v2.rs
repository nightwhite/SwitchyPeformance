use std::collections::{BTreeMap, BTreeSet};

use config_model::{V2Configuration, V2Profile, V2ProxyServer, V2RouteTarget};
use routing_core::{
    V2AutoSwitchProgram, V2IndexedRule, V2ProgramStep, V2RoutingCompileError,
    compile_v2_auto_switch_program,
};
use serde_json::{Value, json};
use thiserror::Error;

mod conditions;

use conditions::PacConditionRenderer;

pub fn compile_v2_auto_switch_pac(
    configuration: &V2Configuration,
) -> Result<String, V2PacCompileError> {
    let program = compile_v2_auto_switch_program(configuration)?;
    compile_v2_auto_switch_pac_from_program(configuration, &program)
}

pub fn compile_v2_auto_switch_pac_from_program(
    configuration: &V2Configuration,
    program: &V2AutoSwitchProgram,
) -> Result<String, V2PacCompileError> {
    let profiles = configuration
        .profiles
        .iter()
        .map(|profile| (profile_id(profile), profile))
        .collect::<BTreeMap<_, _>>();
    let proxies = configuration
        .proxy_servers
        .iter()
        .map(|proxy| (proxy.id.as_str(), proxy))
        .collect::<BTreeMap<_, _>>();
    render_auto_switch(program, &profiles, &proxies)
}

fn render_auto_switch(
    program: &V2AutoSwitchProgram,
    profiles: &BTreeMap<&str, &V2Profile>,
    proxies: &BTreeMap<&str, &V2ProxyServer>,
) -> Result<String, V2PacCompileError> {
    let mut source = String::from(
        "function _spV(h,e,s){var b=e[h]||null;var v=h;while(true){var c=s[v];if(c&&(!b||c[0]<b[0]))b=c;var d=v.indexOf('.');if(d<0)break;v=v.slice(d+1);}return b;}\nfunction _spB(host,patterns){for(var i=0;i<patterns.length;i++){var pattern=patterns[i];if(pattern==='<local>'&&host.indexOf('.')<0)return true;if(pattern!=='<local>'&&shExpMatch(host,pattern))return true;}return false;}\nfunction _spR(url,host,route){if(typeof route==='string')return route;if(route.b&&_spB(host,route.b))return 'DIRECT';var i=url.indexOf(':');var scheme=i<0?'':url.slice(0,i).toLowerCase();if(scheme==='http'&&route.h)return route.h;if(scheme==='https'&&route.s)return route.s;if(scheme==='ftp'&&route.f)return route.f;return route.d;}\n",
    );
    let mut body = String::new();
    let mut conditions = PacConditionRenderer::default();
    let mut routes = RouteTable::default();
    let mut index_number = 0;
    for step in &program.steps {
        match step {
            V2ProgramStep::Indexed { exact, suffix } => {
                let exact_name = format!("_spE{index_number}");
                let suffix_name = format!("_spS{index_number}");
                source.push_str("var ");
                source.push_str(&exact_name);
                source.push('=');
                source.push_str(&render_index(
                    exact,
                    profiles,
                    proxies,
                    &program.proxy_failure_policy,
                    &mut routes,
                )?);
                source.push_str(";var ");
                source.push_str(&suffix_name);
                source.push('=');
                source.push_str(&render_index(
                    suffix,
                    profiles,
                    proxies,
                    &program.proxy_failure_policy,
                    &mut routes,
                )?);
                source.push_str(";\n");
                body.push_str("var r");
                body.push_str(&index_number.to_string());
                body.push_str("=_spV(host,");
                body.push_str(&exact_name);
                body.push(',');
                body.push_str(&suffix_name);
                body.push_str(");if(r");
                body.push_str(&index_number.to_string());
                body.push_str(")return _spR(url,host,_spT[r");
                body.push_str(&index_number.to_string());
                body.push_str("[1]]);\n");
                index_number += 1;
            }
            V2ProgramStep::Complex {
                condition, target, ..
            } => {
                let route = routes.insert(resolve_target(
                    target,
                    profiles,
                    proxies,
                    &program.proxy_failure_policy,
                    &mut BTreeSet::new(),
                )?)?;
                body.push_str("if(");
                body.push_str(&conditions.render(condition)?);
                body.push_str(")return _spR(url,host,_spT[");
                body.push_str(&route.to_string());
                body.push_str("]);\n");
            }
        }
    }
    let fallback = routes.insert(resolve_target(
        &program.fallback,
        profiles,
        proxies,
        &program.proxy_failure_policy,
        &mut BTreeSet::new(),
    )?)?;
    let routes = serde_json::to_string(&routes.entries)?;
    source.push_str(&conditions.declarations()?);
    source.push_str("var _spT=");
    source.push_str(&routes);
    source.push_str(";var _spF=");
    source.push_str(&fallback.to_string());
    source.push_str(";\nfunction FindProxyForURL(url,host){host=(host||'').toLowerCase();\n");
    if program.loopback_policy != "use-rules" {
        source.push_str(
            "if(host==='localhost'||host.slice(-10)==='.localhost'||host==='0.0.0.0'||host==='::'||host==='[::]'||host==='::1'||host==='[::1]'||host.indexOf('127.')===0)return 'DIRECT';\n",
        );
    }
    source.push_str(&body);
    source.push_str("return _spR(url,host,_spT[_spF]);\n}\n");
    Ok(source)
}

fn render_index(
    rules: &[V2IndexedRule],
    profiles: &BTreeMap<&str, &V2Profile>,
    proxies: &BTreeMap<&str, &V2ProxyServer>,
    failure_policy: &str,
    routes: &mut RouteTable,
) -> Result<String, V2PacCompileError> {
    let mut entries = BTreeMap::new();
    for rule in rules {
        let route = routes.insert(resolve_target(
            &rule.target,
            profiles,
            proxies,
            failure_policy,
            &mut BTreeSet::new(),
        )?)?;
        entries.insert(rule.pattern.clone(), json!([rule.ordinal, route]));
    }
    Ok(serde_json::to_string(&entries)?)
}

#[derive(Default)]
struct RouteTable {
    ids: BTreeMap<String, usize>,
    entries: Vec<Value>,
}

impl RouteTable {
    fn insert(&mut self, route: Value) -> Result<usize, V2PacCompileError> {
        let key = serde_json::to_string(&route)?;
        if let Some(route_id) = self.ids.get(&key) {
            return Ok(*route_id);
        }

        let route_id = self.entries.len();
        self.ids.insert(key, route_id);
        self.entries.push(route);
        Ok(route_id)
    }
}

fn resolve_target(
    target: &V2RouteTarget,
    profiles: &BTreeMap<&str, &V2Profile>,
    proxies: &BTreeMap<&str, &V2ProxyServer>,
    failure_policy: &str,
    visiting: &mut BTreeSet<String>,
) -> Result<Value, V2PacCompileError> {
    if !visiting.insert(target.profile_id.clone()) {
        return Err(V2PacCompileError::VirtualProfileCycle(
            target.profile_id.clone(),
        ));
    }
    let result = match profiles
        .get(target.profile_id.as_str())
        .ok_or_else(|| V2PacCompileError::MissingProfile(target.profile_id.clone()))?
    {
        V2Profile::Direct(_) => Ok(json!("DIRECT")),
        V2Profile::FixedProxy(profile) => {
            let fallback =
                proxy_directive(&profile.routes.fallback_proxy_id, proxies, failure_policy)?;
            let http = profile
                .routes
                .http_proxy_id
                .as_deref()
                .map(|proxy_id| proxy_directive(proxy_id, proxies, failure_policy))
                .transpose()?;
            let https = profile
                .routes
                .https_proxy_id
                .as_deref()
                .map(|proxy_id| proxy_directive(proxy_id, proxies, failure_policy))
                .transpose()?;
            let ftp = profile
                .routes
                .ftp_proxy_id
                .as_deref()
                .map(|proxy_id| proxy_directive(proxy_id, proxies, failure_policy))
                .transpose()?;
            Ok(json!({
                "d": fallback,
                "h": http,
                "s": https,
                "f": ftp,
                "b": &profile.bypass_list,
            }))
        }
        V2Profile::Virtual(profile) => {
            resolve_target(&profile.target, profiles, proxies, failure_policy, visiting)
        }
        V2Profile::System(_) => Err(V2PacCompileError::SystemRouteInAutoSwitch),
        V2Profile::Pac(_)
        | V2Profile::AutoDetect(_)
        | V2Profile::AutoSwitch(_)
        | V2Profile::RuleList(_) => Err(V2PacCompileError::UnsupportedTarget(
            target.profile_id.clone(),
        )),
    };
    visiting.remove(&target.profile_id);
    result
}

fn proxy_directive(
    proxy_id: &str,
    proxies: &BTreeMap<&str, &V2ProxyServer>,
    failure_policy: &str,
) -> Result<String, V2PacCompileError> {
    let proxy = proxies
        .get(proxy_id)
        .ok_or_else(|| V2PacCompileError::MissingProxy(proxy_id.to_owned()))?;
    Ok(format!(
        "{} {}:{}{}",
        pac_scheme(proxy)?,
        proxy.host,
        proxy.port,
        if failure_policy == "direct" {
            "; DIRECT"
        } else {
            ""
        }
    ))
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

fn pac_scheme(proxy: &V2ProxyServer) -> Result<&'static str, V2PacCompileError> {
    match proxy.scheme.as_str() {
        "http" => Ok("PROXY"),
        "https" => Ok("HTTPS"),
        "socks4" => Ok("SOCKS4"),
        "socks5" => Ok("SOCKS5"),
        _ => Err(V2PacCompileError::InvalidProxyScheme(proxy.scheme.clone())),
    }
}

#[derive(Debug, Error)]
pub enum V2PacCompileError {
    #[error("V2 路由计划生成失败：{0}")]
    Routing(#[from] V2RoutingCompileError),
    #[error("未知配置：{0}")]
    MissingProfile(String),
    #[error("未知代理：{0}")]
    MissingProxy(String),
    #[error("自动切换不能使用系统代理")]
    SystemRouteInAutoSwitch,
    #[error("自动切换暂不支持目标配置：{0}")]
    UnsupportedTarget(String),
    #[error("自动切换中的虚拟配置循环：{0}")]
    VirtualProfileCycle(String),
    #[error("自动切换暂不支持该条件")]
    UnsupportedCondition,
    #[error("IP 网段无效：{address}/{prefix_length}")]
    InvalidIpCidr { address: String, prefix_length: u8 },
    #[error("代理协议无效：{0}")]
    InvalidProxyScheme(String),
    #[error("PAC JSON 序列化失败：{0}")]
    Json(#[from] serde_json::Error),
}
