use config_model::{
    V2AutoSwitchProfile, V2Configuration, V2FixedProxyProfile, V2NamedProfile, V2NetworkMonitor,
    V2Profile, V2ProxyRoutes, V2ProxyServer, V2RouteTarget, V2RuleCondition, V2RuntimeSettings,
    V2SwitchRule,
};
use pac_compiler::compile_v2_auto_switch_pac;

const LARGE_RULE_COUNT: usize = 50_000;

#[test]
fn emits_a_v2_proxy_directive_with_direct_failover() {
    let pac =
        compile_v2_auto_switch_pac(&configuration()).expect("v2 configuration should compile");

    assert!(pac.contains("SOCKS5 socks.example:1080; DIRECT"));
    assert!(pac.contains("example.com"));
    assert!(pac.contains("function FindProxyForURL"));
    assert!(pac.contains("host==='0.0.0.0'"));
}

#[test]
fn emits_protocol_specific_fixed_proxy_routes() {
    let pac =
        compile_v2_auto_switch_pac(&configuration()).expect("v2 configuration should compile");

    assert!(pac.contains("SOCKS5 socks.example:1080; DIRECT"));
    assert!(pac.contains("PROXY http.example:8080; DIRECT"));
    assert!(pac.contains("HTTPS https.example:8443; DIRECT"));
    assert!(pac.contains("SOCKS4 ftp.example:2121; DIRECT"));
    assert!(pac.contains("function _spR(url,host,route)"));
}

#[test]
fn emits_target_proxy_bypass_patterns() {
    let mut configuration = configuration();
    let Some(V2Profile::FixedProxy(profile)) = configuration
        .profiles
        .iter_mut()
        .find(|profile| matches!(profile, V2Profile::FixedProxy(value) if value.id == "proxy"))
    else {
        panic!("test configuration must contain the proxy profile");
    };
    profile.bypass_list = vec!["*.internal.example".to_owned(), "<local>".to_owned()];

    let pac = compile_v2_auto_switch_pac(&configuration)
        .expect("v2 configuration with bypass patterns should compile");

    assert!(pac.contains("function _spB(host,patterns)"));
    assert!(pac.contains("*.internal.example"));
    assert!(pac.contains("<local>"));
    assert!(pac.contains("if(route.b&&_spB(host,route.b))return 'DIRECT'"));
}

#[test]
fn compacts_repeated_proxy_routes_for_fifty_thousand_host_rules() {
    let mut configuration = configuration();
    let Some(V2Profile::AutoSwitch(profile)) = configuration
        .profiles
        .iter_mut()
        .find(|profile| matches!(profile, V2Profile::AutoSwitch(value) if value.id == "auto"))
    else {
        panic!("test configuration must contain the automatic profile");
    };
    profile.rules = (0..LARGE_RULE_COUNT)
        .map(|index| V2SwitchRule {
            id: format!("rule-{index}"),
            enabled: true,
            condition: V2RuleCondition::HostWildcard {
                pattern: format!("*.node-{index}.example.com"),
            },
            target: target("proxy"),
        })
        .collect();

    let pac =
        compile_v2_auto_switch_pac(&configuration).expect("large V2 host rule set should compile");

    assert!(pac.contains("var _spT=["));
    assert_eq!(pac.match_indices("SOCKS5 socks.example:1080").count(), 1);
    assert!(
        pac.len() < 1_800_000,
        "PAC source should stay compact; actual size: {} bytes",
        pac.len()
    );
}

#[test]
fn preserves_a_url_rule_before_a_later_host_index() {
    let mut configuration = configuration();
    let Some(V2Profile::AutoSwitch(profile)) = configuration
        .profiles
        .iter_mut()
        .find(|profile| matches!(profile, V2Profile::AutoSwitch(value) if value.id == "auto"))
    else {
        panic!("test configuration must contain the automatic profile");
    };
    profile.rules = vec![
        V2SwitchRule {
            id: "url-first".to_owned(),
            enabled: true,
            condition: V2RuleCondition::UrlWildcard {
                pattern: "*://api.example.com/*".to_owned(),
            },
            target: target("direct"),
        },
        V2SwitchRule {
            id: "host-second".to_owned(),
            enabled: true,
            condition: V2RuleCondition::HostWildcard {
                pattern: "*.example.com".to_owned(),
            },
            target: target("proxy"),
        },
    ];

    let pac = compile_v2_auto_switch_pac(&configuration)
        .expect("mixed V2 conditions should compile into an ordered PAC");
    let complex = pac
        .find("shExpMatch(url,\"*://api.example.com/*\")")
        .expect("PAC should contain the URL condition");
    let indexed = pac
        .find("var r0=_spV")
        .expect("PAC should contain the later host index lookup");

    assert!(
        complex < indexed,
        "the URL rule must run before the host index"
    );
}

#[test]
fn omits_the_loopback_direct_guard_when_the_user_allows_rules() {
    let mut configuration = configuration();
    let Some(V2Profile::AutoSwitch(profile)) = configuration
        .profiles
        .iter_mut()
        .find(|profile| matches!(profile, V2Profile::AutoSwitch(value) if value.id == "auto"))
    else {
        panic!("test configuration must contain the automatic profile");
    };
    profile.loopback_policy = "use-rules".to_owned();
    profile.rules.insert(
        0,
        V2SwitchRule {
            id: "localhost-proxy".to_owned(),
            enabled: true,
            condition: V2RuleCondition::HostWildcard {
                pattern: "localhost".to_owned(),
            },
            target: target("proxy"),
        },
    );

    let pac = compile_v2_auto_switch_pac(&configuration)
        .expect("a configuration that explicitly permits local rules should compile");

    assert!(pac.contains("localhost"));
    assert!(!pac.contains("host==='localhost'"));
}

#[test]
fn emits_precompiled_advanced_conditions() {
    let mut configuration = configuration();
    let Some(V2Profile::AutoSwitch(profile)) = configuration
        .profiles
        .iter_mut()
        .find(|profile| matches!(profile, V2Profile::AutoSwitch(value) if value.id == "auto"))
    else {
        panic!("test configuration must contain the automatic profile");
    };
    profile.rules = vec![
        rule(
            "host-regex",
            V2RuleCondition::HostRegex {
                pattern: r"(^|\.)example\.com$".to_owned(),
            },
        ),
        rule(
            "host-levels",
            V2RuleCondition::HostLevels {
                min: 2,
                max: Some(4),
            },
        ),
        rule(
            "ip-cidr",
            V2RuleCondition::IpCidr {
                address: "10.0.0.0".to_owned(),
                prefix_length: 8,
            },
        ),
        rule(
            "url-wildcard",
            V2RuleCondition::UrlWildcard {
                pattern: "*://api.example.com/*".to_owned(),
            },
        ),
        rule(
            "url-regex",
            V2RuleCondition::UrlRegex {
                pattern: "^https://api\\.example\\.com/".to_owned(),
            },
        ),
        rule(
            "keyword",
            V2RuleCondition::Keyword {
                value: "example-keyword".to_owned(),
            },
        ),
        rule(
            "time-range",
            V2RuleCondition::TimeRange {
                start_minute: 22 * 60,
                end_minute: 2 * 60,
            },
        ),
        rule(
            "weekday",
            V2RuleCondition::Weekday {
                days: vec![1, 2, 3, 4, 5],
            },
        ),
    ];

    let pac = compile_v2_auto_switch_pac(&configuration)
        .expect("advanced V2 conditions should compile into PAC source");

    assert!(pac.contains("new RegExp("));
    assert!(pac.contains("_spL(host,2,4)"));
    assert!(pac.contains("isInNet(host,\"10.0.0.0\",\"255.0.0.0\")"));
    assert!(pac.contains("shExpMatch(url,\"*://api.example.com/*\")"));
    assert!(pac.contains("url.indexOf(\"example-keyword\")>=0"));
    assert!(pac.contains("_spM(1320,120)"));
    assert!(pac.contains("_spW([1,2,3,4,5])"));
}

fn configuration() -> V2Configuration {
    V2Configuration {
        schema_version: 2,
        active_profile_id: "auto".to_owned(),
        profiles: vec![
            V2Profile::Direct(V2NamedProfile {
                id: "direct".to_owned(),
                name: "直连".to_owned(),
            }),
            V2Profile::System(V2NamedProfile {
                id: "system".to_owned(),
                name: "系统".to_owned(),
            }),
            V2Profile::FixedProxy(V2FixedProxyProfile {
                id: "proxy".to_owned(),
                name: "代理".to_owned(),
                routes: V2ProxyRoutes {
                    fallback_proxy_id: "socks".to_owned(),
                    http_proxy_id: Some("http".to_owned()),
                    https_proxy_id: Some("https".to_owned()),
                    ftp_proxy_id: Some("ftp".to_owned()),
                },
                bypass_list: vec![],
            }),
            V2Profile::AutoSwitch(V2AutoSwitchProfile {
                id: "auto".to_owned(),
                name: "自动".to_owned(),
                fallback: target("direct"),
                loopback_policy: "direct".to_owned(),
                proxy_failure_policy: "direct".to_owned(),
                rules: vec![V2SwitchRule {
                    id: "example".to_owned(),
                    enabled: true,
                    condition: V2RuleCondition::HostWildcard {
                        pattern: "*.example.com".to_owned(),
                    },
                    target: target("proxy"),
                }],
                rule_source_ids: vec![],
            }),
        ],
        proxy_servers: vec![
            V2ProxyServer {
                id: "socks".to_owned(),
                name: "SOCKS".to_owned(),
                scheme: "socks5".to_owned(),
                host: "socks.example".to_owned(),
                port: 1080,
                credential_id: None,
            },
            V2ProxyServer {
                id: "http".to_owned(),
                name: "HTTP".to_owned(),
                scheme: "http".to_owned(),
                host: "http.example".to_owned(),
                port: 8080,
                credential_id: None,
            },
            V2ProxyServer {
                id: "https".to_owned(),
                name: "HTTPS".to_owned(),
                scheme: "https".to_owned(),
                host: "https.example".to_owned(),
                port: 8443,
                credential_id: None,
            },
            V2ProxyServer {
                id: "ftp".to_owned(),
                name: "FTP".to_owned(),
                scheme: "socks4".to_owned(),
                host: "ftp.example".to_owned(),
                port: 2121,
                credential_id: None,
            },
        ],
        rule_sources: vec![],
        settings: V2RuntimeSettings {
            startup_profile_id: "auto".to_owned(),
            reload_after_profile_change: false,
            rule_insert_position: "last".to_owned(),
            network_monitor: V2NetworkMonitor { enabled: false },
        },
    }
}

fn target(profile_id: &str) -> V2RouteTarget {
    V2RouteTarget {
        profile_id: profile_id.to_owned(),
    }
}

fn rule(id: &str, condition: V2RuleCondition) -> V2SwitchRule {
    V2SwitchRule {
        id: id.to_owned(),
        enabled: true,
        condition,
        target: target("proxy"),
    }
}
