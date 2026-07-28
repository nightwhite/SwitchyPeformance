use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case", tag = "type")]
pub enum V2RuleCondition {
    HostWildcard { pattern: String },
    HostRegex { pattern: String },
    HostLevels { min: u16, max: Option<u16> },
    IpCidr { address: String, prefix_length: u8 },
    UrlWildcard { pattern: String },
    UrlRegex { pattern: String },
    Keyword { value: String },
    Always,
    Bypass { pattern: String },
    TimeRange { start_minute: u16, end_minute: u16 },
    Weekday { days: Vec<u8> },
    Never,
}
