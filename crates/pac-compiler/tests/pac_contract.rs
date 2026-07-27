use config_model::{
    AutoSwitchProfile, Configuration, LoopbackPolicy, Profile, ProxyEndpoint, ProxyFailurePolicy,
    ProxyScheme, RouteTarget, Rule, RuleCondition,
};
use pac_compiler::compile_auto_switch_pac;

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
fn emits_indexed_pac_for_common_host_rules() {
    let source = compile_auto_switch_pac(&configuration())
        .expect("a valid auto-switch profile should emit PAC source");

    assert!(source.contains("function FindProxyForURL(url, host)"));
    assert!(source.contains("SOCKS5 127.0.0.1:1080"));
    assert!(source.contains("SOCKS5 127.0.0.1:1080; DIRECT"));
    assert!(source.contains("static.x.test"));
    assert!(source.contains("x.test"));
    assert!(source.contains("localhost"));
    assert!(!source.contains("for (var rule"));
}

#[test]
fn can_keep_proxy_only_when_direct_failover_is_disabled() {
    let mut configuration = configuration();
    let Profile::AutoSwitch(profile) = &mut configuration.profiles[0] else {
        panic!("test configuration must be automatic");
    };
    profile.proxy_failure_policy = ProxyFailurePolicy::Block;

    let source = compile_auto_switch_pac(&configuration)
        .expect("proxy-only automatic profile should emit PAC source");

    assert!(source.contains("SOCKS5 127.0.0.1:1080"));
    assert!(!source.contains("SOCKS5 127.0.0.1:1080; DIRECT"));
}
