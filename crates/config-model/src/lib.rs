#![forbid(unsafe_code)]

mod conditions;
mod profiles;

pub use conditions::V2RuleCondition;
pub use profiles::{
    V2AutoSwitchProfile, V2Configuration, V2FixedProxyProfile, V2NamedProfile, V2NetworkMonitor,
    V2PacProfile, V2Profile, V2ProxyRoutes, V2ProxyServer, V2RefreshPolicy, V2RouteTarget,
    V2RuleListProfile, V2RuleSource, V2RuntimeSettings, V2Source, V2SourceRequestHeader,
    V2SwitchRule, V2VirtualProfile,
};

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProxyScheme {
    Http,
    Https,
    Socks4,
    Socks5,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyEndpoint {
    pub id: String,
    pub name: String,
    pub scheme: ProxyScheme,
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub bypass_list: Vec<String>,
    #[serde(default)]
    pub credential_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum RouteTarget {
    Direct,
    System,
    Proxy {
        #[serde(rename = "proxyId")]
        proxy_id: String,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LoopbackPolicy {
    Direct,
    UseRules,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProxyFailurePolicy {
    #[default]
    Direct,
    Block,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case", tag = "type", content = "value")]
pub enum RuleCondition {
    HostEquals(String),
    HostSuffix(String),
    UrlGlob(String),
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub enabled: bool,
    pub condition: RuleCondition,
    pub target: RouteTarget,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectProfile {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemProfile {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixedProxyProfile {
    pub id: String,
    pub name: String,
    pub proxy_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoSwitchProfile {
    pub id: String,
    pub name: String,
    pub loopback_policy: LoopbackPolicy,
    #[serde(default)]
    pub proxy_failure_policy: ProxyFailurePolicy,
    pub fallback: RouteTarget,
    pub rules: Vec<Rule>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case", tag = "kind")]
pub enum Profile {
    Direct(DirectProfile),
    System(SystemProfile),
    FixedProxy(FixedProxyProfile),
    AutoSwitch(AutoSwitchProfile),
}

impl Profile {
    pub fn id(&self) -> &str {
        match self {
            Self::Direct(profile) => &profile.id,
            Self::System(profile) => &profile.id,
            Self::FixedProxy(profile) => &profile.id,
            Self::AutoSwitch(profile) => &profile.id,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Configuration {
    pub schema_version: u32,
    pub active_profile_id: String,
    pub proxies: Vec<ProxyEndpoint>,
    pub profiles: Vec<Profile>,
}

impl Configuration {
    pub fn validate(&self) -> Result<(), ConfigurationError> {
        if self.schema_version != 1 {
            return Err(ConfigurationError::UnsupportedSchemaVersion(
                self.schema_version,
            ));
        }

        let proxy_ids = collect_ids(self.proxies.iter().map(|proxy| proxy.id.as_str()), "proxy")?;
        let profile_ids = collect_ids(self.profiles.iter().map(Profile::id), "profile")?;

        if !profile_ids.contains(&self.active_profile_id) {
            return Err(ConfigurationError::UnknownActiveProfile(
                self.active_profile_id.clone(),
            ));
        }

        for proxy in &self.proxies {
            if proxy.host.trim().is_empty() {
                return Err(ConfigurationError::EmptyProxyHost(proxy.id.clone()));
            }
        }

        for profile in &self.profiles {
            match profile {
                Profile::FixedProxy(profile) => {
                    require_proxy(&profile.proxy_id, &proxy_ids)?;
                }
                Profile::AutoSwitch(profile) => validate_auto_switch(profile, &proxy_ids)?,
                Profile::Direct(_) | Profile::System(_) => {}
            }
        }

        Ok(())
    }
}

fn collect_ids<'a>(
    ids: impl Iterator<Item = &'a str>,
    category: &'static str,
) -> Result<BTreeSet<String>, ConfigurationError> {
    let mut collected = BTreeSet::new();

    for id in ids {
        if id.trim().is_empty() {
            return Err(ConfigurationError::EmptyIdentifier(category));
        }
        if !collected.insert(id.to_owned()) {
            return Err(ConfigurationError::DuplicateIdentifier {
                category,
                id: id.to_owned(),
            });
        }
    }

    Ok(collected)
}

fn validate_auto_switch(
    profile: &AutoSwitchProfile,
    proxy_ids: &BTreeSet<String>,
) -> Result<(), ConfigurationError> {
    validate_route_target(&profile.fallback, proxy_ids)?;
    let mut rule_ids = BTreeSet::new();

    for rule in &profile.rules {
        if rule.id.trim().is_empty() {
            return Err(ConfigurationError::EmptyIdentifier("rule"));
        }
        if !rule_ids.insert(&rule.id) {
            return Err(ConfigurationError::DuplicateIdentifier {
                category: "rule",
                id: rule.id.clone(),
            });
        }
        if condition_value(&rule.condition).trim().is_empty() {
            return Err(ConfigurationError::EmptyRuleCondition(rule.id.clone()));
        }
        validate_route_target(&rule.target, proxy_ids)?;
    }

    Ok(())
}

fn condition_value(condition: &RuleCondition) -> &str {
    match condition {
        RuleCondition::HostEquals(value)
        | RuleCondition::HostSuffix(value)
        | RuleCondition::UrlGlob(value) => value,
    }
}

fn validate_route_target(
    target: &RouteTarget,
    proxy_ids: &BTreeSet<String>,
) -> Result<(), ConfigurationError> {
    if let RouteTarget::Proxy { proxy_id } = target {
        require_proxy(proxy_id, proxy_ids)?;
    }
    Ok(())
}

fn require_proxy(proxy_id: &str, proxy_ids: &BTreeSet<String>) -> Result<(), ConfigurationError> {
    if proxy_ids.contains(proxy_id) {
        return Ok(());
    }
    Err(ConfigurationError::UnknownProxy(proxy_id.to_owned()))
}

#[derive(Clone, Debug, Error, Eq, PartialEq)]
pub enum ConfigurationError {
    #[error("不支持的配置版本：{0}")]
    UnsupportedSchemaVersion(u32),
    #[error("{0} 标识不能为空")]
    EmptyIdentifier(&'static str),
    #[error("重复的 {category} 标识：{id}")]
    DuplicateIdentifier { category: &'static str, id: String },
    #[error("当前配置不存在：{0}")]
    UnknownActiveProfile(String),
    #[error("代理地址不能为空：{0}")]
    EmptyProxyHost(String),
    #[error("未知代理：{0}")]
    UnknownProxy(String),
    #[error("规则匹配条件不能为空：{0}")]
    EmptyRuleCondition(String),
}
