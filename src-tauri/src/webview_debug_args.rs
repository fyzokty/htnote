//! Only the Windows debug startup calls this module; release uses wry unchanged.

// wry 0.57.0, src/webview2/mod.rs. Its default autoplay setting is true.
const WRY_DEFAULT_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";

/// One startup snapshot shared by configured and dynamically created webviews.
pub(crate) struct BrowserArguments(Option<String>);

impl BrowserArguments {
    pub(crate) fn new(environment: &str) -> Self {
        Self(merge_browser_args(environment))
    }

    pub(crate) fn apply_to_config(&self, config: &mut tauri::Config) {
        if let Some(arguments) = &self.0 {
            for window in &mut config.app.windows {
                window.additional_browser_args = Some(arguments.clone());
            }
        }
    }

    #[cfg(all(windows, debug_assertions))]
    pub(crate) fn apply_to_window<'a, R: tauri::Runtime, M: tauri::Manager<R>>(
        &self,
        builder: tauri::WebviewWindowBuilder<'a, R, M>,
    ) -> tauri::WebviewWindowBuilder<'a, R, M> {
        match &self.0 {
            Some(arguments) => builder.additional_browser_args(arguments),
            None => builder,
        }
    }
}

/// Empty input leaves automatic window creation and wry's defaults untouched.
/// Feature switches are unions in first-seen order; other tokens keep their
/// original quoting (including paths, spaces and escaped double quotes).
fn merge_browser_args(environment: &str) -> Option<String> {
    if environment.trim().is_empty() {
        return None;
    }
    let input = format!("{WRY_DEFAULT_ARGS} {environment}");
    let mut arguments = Vec::new();
    let mut disabled = Vec::new();
    let mut enabled = Vec::new();
    let mut disable_position = None;
    let mut enable_position = None;
    for (raw, decoded) in tokens(&input) {
        let feature = if let Some(value) = decoded.strip_prefix("--disable-features=") {
            Some((value, &mut disabled, &mut disable_position))
        } else {
            decoded
                .strip_prefix("--enable-features=")
                .map(|value| (value, &mut enabled, &mut enable_position))
        };
        if let Some((value, features, position)) = feature {
            if position.is_none() {
                *position = Some(arguments.len());
                arguments.push(String::new());
            }
            for feature in value
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                if !features.iter().any(|existing| existing == feature) {
                    features.push(feature.to_owned());
                }
            }
        } else {
            arguments.push(raw.to_owned());
        }
    }
    for (position, name, features) in [
        (disable_position, "--disable-features=", disabled),
        (enable_position, "--enable-features=", enabled),
    ] {
        if let Some(position) = position {
            arguments[position] = quote_argument(&format!("{name}{}", features.join(",")));
        }
    }
    Some(arguments.join(" "))
}

/// Windows command-line double quotes group whitespace; backslashes only
/// escape a quote when an odd number precedes it. No shell is involved.
fn tokens(input: &str) -> Vec<(&str, String)> {
    let mut result = Vec::new();
    let mut chars = input.char_indices().peekable();
    while let Some((start, character)) = chars.next() {
        if character.is_whitespace() {
            continue;
        }
        let mut quoted = false;
        let mut decoded = String::new();
        let mut current = Some((start, character));
        let mut end = input.len();
        while let Some((index, character)) = current {
            if character.is_whitespace() && !quoted {
                end = index;
                break;
            }
            if character == '\\' {
                let mut slashes = 1;
                while chars.peek().is_some_and(|(_, value)| *value == '\\') {
                    chars.next();
                    slashes += 1;
                }
                if chars.peek().is_some_and(|(_, value)| *value == '"') {
                    chars.next();
                    decoded.extend(std::iter::repeat_n('\\', slashes / 2));
                    if slashes % 2 == 0 {
                        quoted = !quoted;
                    } else {
                        decoded.push('"');
                    }
                } else {
                    decoded.extend(std::iter::repeat_n('\\', slashes));
                }
            } else if character == '"' {
                quoted = !quoted;
            } else {
                decoded.push(character);
            }
            current = chars.next();
        }
        result.push((&input[start..end], decoded));
    }
    result
}

fn quote_argument(argument: &str) -> String {
    if !argument
        .chars()
        .any(|value| value.is_whitespace() || value == '"')
    {
        return argument.to_owned();
    }
    let mut quoted = String::from("\"");
    let mut slashes = 0;
    for character in argument.chars() {
        if character == '\\' {
            slashes += 1;
            continue;
        }
        quoted.extend(std::iter::repeat_n(
            '\\',
            if character == '"' {
                slashes * 2 + 1
            } else {
                slashes
            },
        ));
        quoted.push(character);
        slashes = 0;
    }
    quoted.extend(std::iter::repeat_n('\\', slashes * 2));
    quoted.push('"');
    quoted
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_environment_does_not_override_wry() {
        for environment in ["", " \t\r\n "] {
            assert_eq!(merge_browser_args(environment), None);
        }
    }

    #[test]
    fn driver_arguments_preserve_wry_defaults() {
        assert_eq!(merge_browser_args("--remote-debugging-port=0 --enable-automation --force-prefers-reduced-motion"),
            Some(format!("{WRY_DEFAULT_ARGS} --remote-debugging-port=0 --enable-automation --force-prefers-reduced-motion")));
    }

    #[test]
    fn repeated_feature_switches_are_merged_and_deduplicated() {
        assert_eq!(merge_browser_args("--disable-features=Alpha,msPdfOOUI --enable-features=One,Two --disable-features=Beta,Alpha --enable-features=Two,Three"),
            Some("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,Alpha,Beta --autoplay-policy=no-user-gesture-required --enable-features=One,Two,Three".into()));
    }

    #[test]
    fn whitespace_and_quoted_feature_values_are_supported() {
        assert_eq!(merge_browser_args(" \t--disable-features=\"Alpha, Beta\"\r\n\"--enable-features=One, Two\" --enable-features=Three "),
            Some("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,Alpha,Beta --autoplay-policy=no-user-gesture-required --enable-features=One,Two,Three".into()));
    }

    #[test]
    fn other_arguments_keep_windows_paths_and_escaped_quotes() {
        let environment =
            r#"--log-file="C:\test logs\driver.log" --name="a\" b" --remote-debugging-port=0"#;
        assert_eq!(
            merge_browser_args(environment),
            Some(format!("{WRY_DEFAULT_ARGS} {environment}"))
        );
    }

    #[test]
    fn quoted_feature_parameters_round_trip() {
        let environment =
            r#"--enable-features="One:param/a b,Two" --enable-features="Three:param/a\" b""#;
        let merged = merge_browser_args(environment).unwrap();
        let decoded: Vec<_> = tokens(&merged)
            .into_iter()
            .map(|(_, value)| value)
            .collect();
        assert_eq!(
            decoded.last().unwrap(),
            "--enable-features=One:param/a b,Two,Three:param/a\" b"
        );
        for value in [r#"a b\"#, r#"a\"b"#, "a b", "simple"] {
            assert_eq!(tokens(&quote_argument(value))[0].1, value);
        }
    }

    #[test]
    fn all_windows_share_arguments_without_changing_other_configuration() {
        let mut config: tauri::Config =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let mut pdf = config.app.windows[0].clone();
        pdf.label = "pdf-export-test".into();
        config.app.windows.push(pdf);
        let original = serde_json::to_value(&config).unwrap();
        BrowserArguments::new(" \t ").apply_to_config(&mut config);
        assert_eq!(serde_json::to_value(&config).unwrap(), original);
        let shared = BrowserArguments::new("--remote-debugging-port=0");
        shared.apply_to_config(&mut config);
        for window in &mut config.app.windows {
            assert_eq!(window.additional_browser_args, shared.0);
            assert!(window.additional_browser_args.as_ref().unwrap().contains("--remote-debugging-port=0"));
            window.additional_browser_args = None;
        }
        assert_eq!(serde_json::to_value(&config).unwrap(), original);
    }
}
