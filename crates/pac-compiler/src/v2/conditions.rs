use std::{
    collections::BTreeMap,
    net::{IpAddr, Ipv4Addr},
};

use config_model::V2RuleCondition;

use super::V2PacCompileError;

#[derive(Default)]
pub(super) struct PacConditionRenderer {
    regex_names: BTreeMap<String, String>,
    regexes: Vec<(String, String)>,
    uses_host_levels: bool,
    uses_time_range: bool,
    uses_weekday: bool,
}

impl PacConditionRenderer {
    pub(super) fn render(
        &mut self,
        condition: &V2RuleCondition,
    ) -> Result<String, V2PacCompileError> {
        match condition {
            V2RuleCondition::HostWildcard { pattern } if pattern.trim() == "*" => {
                Ok("true".to_owned())
            }
            V2RuleCondition::HostRegex { pattern } => self.regex_test(pattern, "host"),
            V2RuleCondition::HostLevels { min, max } => {
                self.uses_host_levels = true;
                let max = max.map_or_else(|| "null".to_owned(), |value| value.to_string());
                Ok(format!("_spL(host,{min},{max})"))
            }
            V2RuleCondition::IpCidr {
                address,
                prefix_length,
            } => render_ip_cidr(address, *prefix_length),
            V2RuleCondition::UrlWildcard { pattern } => Ok(format!(
                "shExpMatch(url,{})",
                serde_json::to_string(pattern)?
            )),
            V2RuleCondition::UrlRegex { pattern } => self.regex_test(pattern, "url"),
            V2RuleCondition::Keyword { value } => {
                Ok(format!("url.indexOf({})>=0", serde_json::to_string(value)?))
            }
            V2RuleCondition::Bypass { value } => Ok(value.to_string()),
            V2RuleCondition::TimeRange {
                start_minute,
                end_minute,
            } => {
                self.uses_time_range = true;
                Ok(format!("_spM({start_minute},{end_minute})"))
            }
            V2RuleCondition::Weekday { days } => {
                self.uses_weekday = true;
                Ok(format!("_spW({})", serde_json::to_string(days)?))
            }
            V2RuleCondition::Never => Ok("false".to_owned()),
            V2RuleCondition::HostWildcard { .. } => Err(V2PacCompileError::UnsupportedCondition),
        }
    }

    pub(super) fn declarations(&self) -> Result<String, V2PacCompileError> {
        let mut source = String::new();
        if self.uses_host_levels {
            source.push_str("function _spL(host,min,max){var levels=host?1:0;for(var i=0;i<host.length;i++){if(host.charAt(i)==='.')levels++;}return levels>=min&&(max===null||levels<=max);}\n");
        }
        if self.uses_time_range {
            source.push_str("function _spM(start,end){var now=new Date();var minute=now.getHours()*60+now.getMinutes();return start<=end?minute>=start&&minute<=end:minute>=start||minute<=end;}\n");
        }
        if self.uses_weekday {
            source
                .push_str("function _spW(days){return days.indexOf((new Date()).getDay())>=0;}\n");
        }
        for (name, pattern) in &self.regexes {
            source.push_str("var ");
            source.push_str(name);
            source.push_str("=new RegExp(");
            source.push_str(&serde_json::to_string(pattern)?);
            source.push_str(");\n");
        }
        Ok(source)
    }

    fn regex_test(&mut self, pattern: &str, subject: &str) -> Result<String, V2PacCompileError> {
        let name = if let Some(name) = self.regex_names.get(pattern) {
            name.clone()
        } else {
            let name = format!("_spRe{}", self.regexes.len());
            self.regex_names.insert(pattern.to_owned(), name.clone());
            self.regexes.push((name.clone(), pattern.to_owned()));
            name
        };
        Ok(format!("{name}.test({subject})"))
    }
}

fn render_ip_cidr(address: &str, prefix_length: u8) -> Result<String, V2PacCompileError> {
    match address.parse::<IpAddr>() {
        Ok(IpAddr::V4(address)) if prefix_length <= 32 => Ok(format!(
            "isInNet(host,{},{})",
            serde_json::to_string(&address.to_string())?,
            serde_json::to_string(&ipv4_mask(prefix_length).to_string())?
        )),
        Ok(IpAddr::V6(address)) if prefix_length <= 128 => Ok(format!(
            "isInNetEx(host,{})",
            serde_json::to_string(&format!("{address}/{prefix_length}"))?
        )),
        _ => Err(V2PacCompileError::InvalidIpCidr {
            address: address.to_owned(),
            prefix_length,
        }),
    }
}

fn ipv4_mask(prefix_length: u8) -> Ipv4Addr {
    let mask = if prefix_length == 0 {
        0
    } else {
        u32::MAX << (32 - prefix_length)
    };
    Ipv4Addr::from(mask)
}
