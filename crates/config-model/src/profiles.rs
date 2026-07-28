use serde::{Deserialize, Serialize};

use crate::V2RuleCondition;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2RouteTarget {
    pub profile_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2ProxyServer {
    pub id: String,
    pub name: String,
    pub scheme: String,
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub credential_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2ProxyRoutes {
    pub fallback_proxy_id: String,
    #[serde(default)]
    pub http_proxy_id: Option<String>,
    #[serde(default)]
    pub https_proxy_id: Option<String>,
    #[serde(default)]
    pub ftp_proxy_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2NamedProfile {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2FixedProxyProfile {
    pub id: String,
    pub name: String,
    pub routes: V2ProxyRoutes,
    #[serde(default)]
    pub bypass_list: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2PacProfile {
    pub id: String,
    pub name: String,
    pub source: V2Source,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2AutoSwitchProfile {
    pub id: String,
    pub name: String,
    pub fallback: V2RouteTarget,
    pub loopback_policy: String,
    pub proxy_failure_policy: String,
    #[serde(default)]
    pub rules: Vec<V2SwitchRule>,
    #[serde(default)]
    pub rule_source_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2RuleListProfile {
    pub id: String,
    pub name: String,
    pub source_id: String,
    pub match_target: V2RouteTarget,
    pub fallback: V2RouteTarget,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2VirtualProfile {
    pub id: String,
    pub name: String,
    pub target: V2RouteTarget,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case", tag = "kind")]
pub enum V2Profile {
    Direct(V2NamedProfile),
    System(V2NamedProfile),
    FixedProxy(V2FixedProxyProfile),
    Pac(V2PacProfile),
    AutoDetect(V2NamedProfile),
    AutoSwitch(V2AutoSwitchProfile),
    RuleList(V2RuleListProfile),
    Virtual(V2VirtualProfile),
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2SwitchRule {
    pub id: String,
    pub enabled: bool,
    pub condition: V2RuleCondition,
    pub target: V2RouteTarget,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2RuleSource {
    pub id: String,
    pub name: String,
    pub format: String,
    pub source: V2Source,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case", tag = "kind")]
pub enum V2Source {
    Inline {
        text: String,
    },
    Url {
        url: String,
        #[serde(default)]
        headers: Vec<V2SourceRequestHeader>,
        refresh: V2RefreshPolicy,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct V2SourceRequestHeader {
    pub name: String,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2RefreshPolicy {
    pub enabled: bool,
    pub refresh_minutes: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2RuntimeSettings {
    pub startup_profile_id: String,
    pub reload_after_profile_change: bool,
    pub rule_insert_position: String,
    pub network_monitor: V2NetworkMonitor,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct V2NetworkMonitor {
    pub enabled: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct V2Configuration {
    pub schema_version: u32,
    pub active_profile_id: String,
    pub profiles: Vec<V2Profile>,
    pub proxy_servers: Vec<V2ProxyServer>,
    #[serde(default)]
    pub rule_sources: Vec<V2RuleSource>,
    pub settings: V2RuntimeSettings,
}
