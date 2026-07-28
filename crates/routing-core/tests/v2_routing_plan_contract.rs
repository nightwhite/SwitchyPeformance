use config_model::{
    V2AutoSwitchProfile, V2Configuration, V2FixedProxyProfile, V2NamedProfile, V2NetworkMonitor,
    V2Profile, V2ProxyRoutes, V2RouteTarget, V2RuleCondition, V2RuntimeSettings, V2SwitchRule,
};
use routing_core::{
    V2DecisionReason, V2ProgramStep, V2RouteDestination, V2RouteRequest,
    compile_v2_auto_switch_program, route_v2_auto_switch,
};

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

#[test]
fn explains_the_same_rule_order_that_the_pac_program_uses() {
    let program = compile_v2_auto_switch_program(&configuration())
        .expect("valid V2 automatic profile should produce a routing program");

    let url_first = route_v2_auto_switch(
        &program,
        V2RouteRequest {
            url: "https://api.example.com/v1",
            weekday: 1,
            minute_of_day: 600,
        },
    );
    assert_eq!(url_first.matched_rule_id.as_deref(), Some("url-first"));
    assert_eq!(profile_id(&url_first.destination), Some("direct"));
    assert_eq!(url_first.reason, V2DecisionReason::ComplexRule);
    assert!(url_first.pending_rule_id.is_none());

    let host_second = route_v2_auto_switch(
        &program,
        V2RouteRequest {
            url: "https://www.example.com/",
            weekday: 1,
            minute_of_day: 600,
        },
    );
    assert_eq!(host_second.matched_rule_id.as_deref(), Some("host-second"));
    assert_eq!(profile_id(&host_second.destination), Some("proxy"));
    assert_eq!(host_second.reason, V2DecisionReason::IndexedRule);
}

#[test]
fn keeps_loopback_direct_to_match_the_generated_chrome_pac() {
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

    let program = compile_v2_auto_switch_program(&configuration)
        .expect("valid V2 automatic profile should produce a routing program");
    let decision = route_v2_auto_switch(
        &program,
        V2RouteRequest {
            url: "http://localhost:3000/",
            weekday: 1,
            minute_of_day: 600,
        },
    );

    assert_eq!(decision.destination, V2RouteDestination::Direct);
    assert_eq!(decision.reason, V2DecisionReason::BrowserLoopbackDirect);
    assert!(decision.matched_rule_id.is_none());
}

#[test]
fn reports_domain_ip_network_rules_as_pending_pac_dns_checks() {
    let mut configuration = configuration();
    let Some(V2Profile::AutoSwitch(profile)) = configuration
        .profiles
        .iter_mut()
        .find(|profile| matches!(profile, V2Profile::AutoSwitch(value) if value.id == "auto"))
    else {
        panic!("test configuration must contain the automatic profile");
    };
    profile.rules.insert(
        0,
        V2SwitchRule {
            id: "private-network".to_owned(),
            enabled: true,
            condition: V2RuleCondition::IpCidr {
                address: "10.0.0.0".to_owned(),
                prefix_length: 8,
            },
            target: target("proxy"),
        },
    );

    let program = compile_v2_auto_switch_program(&configuration)
        .expect("valid V2 automatic profile should produce a routing program");
    let decision = route_v2_auto_switch(
        &program,
        V2RouteRequest {
            url: "https://private.example.com/",
            weekday: 1,
            minute_of_day: 600,
        },
    );

    assert!(decision.matched_rule_id.is_none());
    assert_eq!(decision.pending_rule_id.as_deref(), Some("private-network"));
    assert_eq!(profile_id(&decision.destination), Some("proxy"));
    assert_eq!(decision.reason, V2DecisionReason::RequiresPacDns);
    assert!(
        decision
            .warnings
            .iter()
            .any(|warning| warning.as_str() == "requires-pac-dns")
    );
}

#[test]
fn warns_when_a_javascript_only_regex_cannot_be_reproduced_locally() {
    let mut configuration = configuration();
    let Some(V2Profile::AutoSwitch(profile)) = configuration
        .profiles
        .iter_mut()
        .find(|profile| matches!(profile, V2Profile::AutoSwitch(value) if value.id == "auto"))
    else {
        panic!("test configuration must contain the automatic profile");
    };
    profile.rules.insert(
        0,
        V2SwitchRule {
            id: "javascript-lookbehind".to_owned(),
            enabled: true,
            condition: V2RuleCondition::HostRegex {
                pattern: "(?<=api\\.)example\\.test".to_owned(),
            },
            target: target("proxy"),
        },
    );

    let program = compile_v2_auto_switch_program(&configuration)
        .expect("valid V2 automatic profile should produce a routing program");
    let decision = route_v2_auto_switch(
        &program,
        V2RouteRequest {
            url: "https://api.example.test/",
            weekday: 1,
            minute_of_day: 600,
        },
    );

    assert_eq!(profile_id(&decision.destination), Some("direct"));
    assert_eq!(decision.reason, V2DecisionReason::ProfileDefault);
    assert!(
        decision
            .warnings
            .iter()
            .any(|warning| warning.as_str() == "unsupported-regex")
    );
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

fn profile_id(destination: &V2RouteDestination) -> Option<&str> {
    match destination {
        V2RouteDestination::Direct => None,
        V2RouteDestination::Profile(target) => Some(&target.profile_id),
    }
}
