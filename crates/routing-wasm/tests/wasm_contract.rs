use config_model::{
    AutoSwitchProfile, Configuration, LoopbackPolicy, Profile, ProxyEndpoint, ProxyScheme,
    RouteTarget, Rule, RuleCondition,
};
use routing_wasm::{compile_configuration_json, explain_route_configuration_json};

#[test]
fn exposes_pac_and_metrics_through_a_json_boundary() {
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
            name: "Automatic".to_owned(),
            loopback_policy: LoopbackPolicy::Direct,
            proxy_failure_policy: Default::default(),
            fallback: RouteTarget::Direct,
            rules: vec![Rule {
                id: "proxy-x".to_owned(),
                enabled: true,
                condition: RuleCondition::HostSuffix("x.test".to_owned()),
                target: RouteTarget::Proxy {
                    proxy_id: "edge".to_owned(),
                },
            }],
        })],
    };

    let result = compile_configuration_json(
        &serde_json::to_string(&configuration).expect("configuration should serialize"),
    )
    .expect("valid configuration should compile");

    assert!(result.pac_source.contains("SOCKS5 127.0.0.1:1080"));
    assert_eq!(result.simple_rule_count, 1);
    assert_eq!(result.complex_rule_count, 0);
    assert_eq!(result.index_block_count, 1);
}

#[test]
fn accepts_the_browser_facing_camel_case_document_shape() {
    let configuration = r#"
    {
      "schemaVersion": 1,
      "activeProfileId": "auto",
      "proxies": [
        {
          "id": "edge",
          "name": "Edge gateway",
          "scheme": "socks5",
          "host": "127.0.0.1",
          "port": 1080,
          "bypassList": []
        }
      ],
      "profiles": [
        {
          "kind": "auto-switch",
          "id": "auto",
          "name": "Automatic",
          "loopbackPolicy": "direct",
          "fallback": { "kind": "direct" },
          "rules": [
            {
              "id": "proxy-x",
              "enabled": true,
              "condition": { "type": "host-suffix", "value": "x.test" },
              "target": { "kind": "proxy", "proxyId": "edge" }
            }
          ]
        }
      ]
    }
  "#;

    let result = compile_configuration_json(configuration)
        .expect("the browser-facing configuration should compile");

    assert_eq!(result.simple_rule_count, 1);
}

#[test]
fn explains_any_url_with_the_matching_rule_instead_of_a_fixed_diagnostic_host() {
    let configuration = r#"
    {
      "schemaVersion": 1,
      "activeProfileId": "auto",
      "proxies": [
        {
          "id": "edge",
          "name": "Edge gateway",
          "scheme": "socks5",
          "host": "127.0.0.1",
          "port": 1080
        }
      ],
      "profiles": [
        {
          "kind": "auto-switch",
          "id": "auto",
          "name": "Automatic",
          "loopbackPolicy": "direct",
          "fallback": { "kind": "direct" },
          "rules": [
            {
              "id": "proxy-example",
              "enabled": true,
              "condition": { "type": "host-suffix", "value": "example.test" },
              "target": { "kind": "proxy", "proxyId": "edge" }
            }
          ]
        }
      ]
    }
    "#;

    let explanation =
        explain_route_configuration_json(configuration, "https://api.example.test/v1")
            .expect("configured URL should be explained");
    let explanation: serde_json::Value =
        serde_json::from_str(&explanation).expect("explanation should be JSON");

    assert_eq!(explanation["matchedRuleId"], "proxy-example");
    assert_eq!(explanation["reason"], "indexed-rule");
    assert_eq!(explanation["route"]["kind"], "proxy");
    assert_eq!(explanation["route"]["proxyId"], "edge");
}
