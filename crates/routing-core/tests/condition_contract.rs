use routing_core::{
    ConditionMatch, matches_host_suffix, matches_ip_cidr, matches_time_range, matches_weekdays,
};

#[test]
fn host_suffix_matches_only_the_domain_or_a_subdomain() {
    assert!(matches_host_suffix("api.example.com", "example.com"));
    assert!(matches_host_suffix("example.com", "example.com"));
    assert!(!matches_host_suffix("notexample.com", "example.com"));
}

#[test]
fn time_range_wraps_across_midnight() {
    assert!(matches_time_range(23 * 60, 22 * 60, 2 * 60));
    assert!(matches_time_range(60, 22 * 60, 2 * 60));
    assert!(!matches_time_range(12 * 60, 22 * 60, 2 * 60));
}

#[test]
fn weekday_matching_is_explicit() {
    assert!(matches_weekdays(1, &[1, 2, 3, 4, 5]));
    assert!(!matches_weekdays(0, &[1, 2, 3, 4, 5]));
}

#[test]
fn literal_ip_cidr_does_not_require_dns_but_hostnames_do() {
    assert_eq!(
        matches_ip_cidr("10.1.2.3", "10.0.0.0", 8),
        ConditionMatch::Match
    );
    assert_eq!(
        matches_ip_cidr("192.168.1.1", "10.0.0.0", 8),
        ConditionMatch::NoMatch
    );
    assert_eq!(
        matches_ip_cidr("api.example.com", "10.0.0.0", 8),
        ConditionMatch::RequiresPacDns
    );
}
