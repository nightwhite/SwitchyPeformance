use config_model::{
    V2AutoSwitchProfile, V2Configuration, V2FixedProxyProfile, V2NamedProfile, V2NetworkMonitor,
    V2Profile, V2ProxyRoutes, V2RouteTarget, V2RuleCondition, V2RuntimeSettings, V2SwitchRule,
};
use routing_core::{V2ProgramStep, compile_v2_auto_switch_program};

#[test]
fn keeps_a_complex_rule_ahead_of_later_indexed_host_rules() {
    let program = compile_v2_auto_switch_program(&configuration())
        .expect("valid V2 automatic profile should produce a routing program");

    assert_eq!(program.metrics.complex_rule_count, 1);
    assert_eq!(program.metrics.indexed_rule_count, 1);
    assert!(matches!(
        program.steps.first(),
        Some(V2ProgramStep::Complex { id, .. }) if id == "url-first"
    ));
    assert!(matches!(
        program.steps.get(1),
        Some(V2ProgramStep::Indexed { suffix, .. })
            if suffix.len() == 1 && suffix[0].id == "host-second"
    ));
}

#[test]
fn reports_ip_network_rules_as_dns_sensitive() {
    let mut configuration = configuration();
    let Some(V2Profile::AutoSwitch(profile)) = configuration
        .profiles
        .iter_mut()
        .find(|profile| matches!(profile, V2Profile::AutoSwitch(value) if value.id == "auto"))
    else {
        panic!("test configuration must contain the automatic profile");
    };
    profile.rules.push(V2SwitchRule {
        id: "private-network".to_owned(),
        enabled: true,
        condition: V2RuleCondition::IpCidr {
            address: "10.0.0.0".to_owned(),
            prefix_length: 8,
        },
        target: target("proxy"),
    });

    let program = compile_v2_auto_switch_program(&configuration)
        .expect("valid V2 automatic profile should produce a routing program");

    assert_eq!(program.metrics.dns_sensitive_rule_count, 1);
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
            V2Profile::FixedProxy(V2FixedProxyProfile {
                id: "proxy".to_owned(),
                name: "代理".to_owned(),
                routes: V2ProxyRoutes {
                    fallback_proxy_id: "proxy-server".to_owned(),
                    http_proxy_id: None,
                    https_proxy_id: None,
                    ftp_proxy_id: None,
                },
                bypass_list: vec![],
            }),
            V2Profile::AutoSwitch(V2AutoSwitchProfile {
                id: "auto".to_owned(),
                name: "自动切换".to_owned(),
                fallback: target("direct"),
                loopback_policy: "direct".to_owned(),
                proxy_failure_policy: "direct".to_owned(),
                rules: vec![
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
                ],
                rule_source_ids: vec![],
            }),
        ],
        proxy_servers: vec![],
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
