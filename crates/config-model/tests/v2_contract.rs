use config_model::{
    V2AutoSwitchProfile, V2Configuration, V2NetworkMonitor, V2Profile, V2RouteTarget,
    V2RuleCondition, V2RuntimeSettings, V2SwitchRule,
};

#[test]
fn preserves_v2_condition_and_profile_target_shapes() {
    let configuration = V2Configuration {
        schema_version: 2,
        active_profile_id: "auto-work".to_owned(),
        profiles: vec![V2Profile::AutoSwitch(V2AutoSwitchProfile {
            id: "auto-work".to_owned(),
            name: "自动切换".to_owned(),
            fallback: V2RouteTarget {
                profile_id: "direct".to_owned(),
            },
            loopback_policy: "direct".to_owned(),
            proxy_failure_policy: "direct".to_owned(),
            rules: vec![V2SwitchRule {
                id: "example".to_owned(),
                enabled: true,
                condition: V2RuleCondition::HostWildcard {
                    pattern: "*.example.com".to_owned(),
                },
                target: V2RouteTarget {
                    profile_id: "proxy-work".to_owned(),
                },
            }],
            rule_source_ids: vec![],
        })],
        proxy_servers: vec![],
        rule_sources: vec![],
        settings: V2RuntimeSettings {
            startup_profile_id: "auto-work".to_owned(),
            reload_after_profile_change: false,
            rule_insert_position: "last".to_owned(),
            network_monitor: V2NetworkMonitor { enabled: false },
        },
    };

    assert_eq!(configuration.schema_version, 2);
    assert_eq!(configuration.active_profile_id, "auto-work");
}
