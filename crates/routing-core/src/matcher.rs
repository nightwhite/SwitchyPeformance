use std::net::IpAddr;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConditionMatch {
    Match,
    NoMatch,
    RequiresPacDns,
}

pub fn matches_host_suffix(host: &str, suffix: &str) -> bool {
    let host = normalize_host(host);
    let suffix = normalize_host(suffix);
    host == suffix || host.strip_suffix(&format!(".{suffix}")).is_some()
}

pub fn matches_time_range(minute_of_day: u16, start_minute: u16, end_minute: u16) -> bool {
    if minute_of_day >= 24 * 60 || start_minute >= 24 * 60 || end_minute >= 24 * 60 {
        return false;
    }

    if start_minute <= end_minute {
        minute_of_day >= start_minute && minute_of_day <= end_minute
    } else {
        minute_of_day >= start_minute || minute_of_day <= end_minute
    }
}

pub fn matches_weekdays(weekday: u8, days: &[u8]) -> bool {
    weekday <= 6 && days.contains(&weekday)
}

pub fn matches_ip_cidr(host: &str, network: &str, prefix_length: u8) -> ConditionMatch {
    let Ok(network) = network.parse::<IpAddr>() else {
        return ConditionMatch::NoMatch;
    };
    let Ok(host) = host.parse::<IpAddr>() else {
        return ConditionMatch::RequiresPacDns;
    };

    match (host, network) {
        (IpAddr::V4(host), IpAddr::V4(network)) if prefix_length <= 32 => {
            if masked_u32(u32::from(host), prefix_length)
                == masked_u32(u32::from(network), prefix_length)
            {
                ConditionMatch::Match
            } else {
                ConditionMatch::NoMatch
            }
        }
        (IpAddr::V6(host), IpAddr::V6(network)) if prefix_length <= 128 => {
            if masked_u128(u128::from(host), prefix_length)
                == masked_u128(u128::from(network), prefix_length)
            {
                ConditionMatch::Match
            } else {
                ConditionMatch::NoMatch
            }
        }
        _ => ConditionMatch::NoMatch,
    }
}

pub fn matches_glob(pattern: &str, value: &str) -> bool {
    let pattern: Vec<char> = pattern.chars().collect();
    let value: Vec<char> = value.chars().collect();
    let mut pattern_index = 0;
    let mut value_index = 0;
    let mut star_index = None;
    let mut retry_value_index = 0;

    while value_index < value.len() {
        if pattern_index < pattern.len()
            && (pattern[pattern_index] == '?' || pattern[pattern_index] == value[value_index])
        {
            pattern_index += 1;
            value_index += 1;
        } else if pattern_index < pattern.len() && pattern[pattern_index] == '*' {
            star_index = Some(pattern_index);
            pattern_index += 1;
            retry_value_index = value_index;
        } else if let Some(star) = star_index {
            pattern_index = star + 1;
            retry_value_index += 1;
            value_index = retry_value_index;
        } else {
            return false;
        }
    }

    while pattern_index < pattern.len() && pattern[pattern_index] == '*' {
        pattern_index += 1;
    }

    pattern_index == pattern.len()
}

fn normalize_host(value: &str) -> String {
    value
        .trim()
        .trim_start_matches("*.")
        .trim_start_matches('.')
        .to_ascii_lowercase()
}

fn masked_u32(value: u32, prefix_length: u8) -> u32 {
    if prefix_length == 0 {
        return 0;
    }
    value
        & u32::MAX
            .checked_shl(u32::from(32 - prefix_length))
            .unwrap_or(0)
}

fn masked_u128(value: u128, prefix_length: u8) -> u128 {
    if prefix_length == 0 {
        return 0;
    }
    value
        & u128::MAX
            .checked_shl(u32::from(128 - prefix_length))
            .unwrap_or(0)
}
