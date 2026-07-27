use config_model::{
    AutoSwitchProfile, Configuration, LoopbackPolicy, Profile, ProxyEndpoint, ProxyScheme,
    RouteTarget, Rule, RuleCondition,
};
use routing_core::RoutingPlan;

fn configuration() -> Configuration {
    Configuration {
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
            name: "Automatic".to_owned(),
            loopback_policy: LoopbackPolicy::Direct,
            proxy_failure_policy: Default::default(),
            fallback: RouteTarget::Direct,
            rules: vec![
                Rule {
                    id: "direct-static".to_owned(),
                    enabled: true,
                    condition: RuleCondition::HostEquals("static.x.test".to_owned()),
                    target: RouteTarget::Direct,
                },
                Rule {
                    id: "proxy-x".to_owned(),
                    enabled: true,
                    condition: RuleCondition::HostSuffix("x.test".to_owned()),
                    target: RouteTarget::Proxy {
                        proxy_id: "edge".to_owned(),
                    },
                },
            ],
        })],
    }
}

#[test]
fn routes_indexed_host_rules_without_proxying_loopback() {
    let plan =
        RoutingPlan::compile(&configuration()).expect("a valid configuration should compile");

    assert_eq!(
        plan.route("https://static.x.test/app").route,
        RouteTarget::Direct
    );
    assert_eq!(
        plan.route("https://api.x.test/v1").route,
        RouteTarget::Proxy {
            proxy_id: "edge".to_owned()
        }
    );
    assert_eq!(
        plan.route("http://localhost:3000/").route,
        RouteTarget::Direct
    );
    assert_eq!(
        plan.route("https://unmatched.test/").route,
        RouteTarget::Direct
    );
}

#[test]
fn records_a_compact_index_for_simple_host_rules() {
    let plan =
        RoutingPlan::compile(&configuration()).expect("a valid configuration should compile");

    assert_eq!(plan.metrics().simple_rule_count, 2);
    assert_eq!(plan.metrics().complex_rule_count, 0);
    assert_eq!(plan.metrics().index_block_count, 1);
}
