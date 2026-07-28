use config_model::{
    AutoSwitchProfile, Configuration, LoopbackPolicy, Profile, ProxyEndpoint, ProxyScheme,
    RouteTarget, Rule, RuleCondition,
};
use pac_compiler::compile_auto_switch_pac;
use routing_core::RoutingPlan;

const RULE_COUNT: usize = 50_000;

#[test]
fn compiles_fifty_thousand_host_rules_into_one_indexed_pac_block() {
    let configuration = Configuration {
        schema_version: 1,
        active_profile_id: "auto".to_owned(),
        proxies: vec![ProxyEndpoint {
            id: "edge".to_owned(),
            name: "Edge gateway".to_owned(),
            scheme: ProxyScheme::Socks5,
            host: "127.0.0.1".to_owned(),
            port: 1080,
            bypass_list: vec![],
            credential_id: None,
        }],
        profiles: vec![Profile::AutoSwitch(AutoSwitchProfile {
            id: "auto".to_owned(),
            name: "Large automatic profile".to_owned(),
            loopback_policy: LoopbackPolicy::Direct,
            proxy_failure_policy: Default::default(),
            fallback: RouteTarget::Direct,
            rules: (0..RULE_COUNT)
                .map(|index| Rule {
                    id: format!("rule-{index}"),
                    enabled: true,
                    condition: RuleCondition::HostSuffix(format!("node-{index}.example.test")),
                    target: RouteTarget::Proxy {
                        proxy_id: "edge".to_owned(),
                    },
                })
                .collect(),
        })],
    };

    let plan = RoutingPlan::compile(&configuration).expect("large indexed profile should compile");
    let source = compile_auto_switch_pac(&configuration).expect("large PAC should compile");

    assert_eq!(plan.metrics().simple_rule_count, RULE_COUNT);
    assert_eq!(plan.metrics().complex_rule_count, 0);
    assert_eq!(plan.metrics().index_block_count, 1);
    assert!(source.contains("var _spS0="));
    assert!(!source.contains("for (var rule"));
    assert!(
        source.len() < 3_400_000,
        "PAC output should stay compact; actual size: {} bytes",
        source.len()
    );
}
