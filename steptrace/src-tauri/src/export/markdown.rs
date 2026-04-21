use crate::session::{Session, Step};
use base64::{engine::general_purpose, Engine};
use std::fs;
use std::path::Path;

pub fn export(
    session: &Session,
    steps: &[Step],
    sessions_dir: &str,
    output_file: &str,
    filename_base: &str,
    embed_images: bool,
) -> Result<(), String> {
    let mut md = String::new();

    md.push_str(&format!(
        "# Sessão Strider — {}\n\n",
        &session.started_at[..10]
    ));

    if let Some(end) = &session.ended_at {
        let duration_secs = {
            let start = chrono::DateTime::parse_from_rfc3339(&session.started_at).ok();
            let end_dt = chrono::DateTime::parse_from_rfc3339(end).ok();
            match (start, end_dt) {
                (Some(s), Some(e)) => (e - s).num_seconds(),
                _ => 0,
            }
        };
        md.push_str(&format!(
            "**Duração:** {}min {}s  \n",
            duration_secs / 60,
            duration_secs % 60
        ));
    }
    md.push_str(&format!("**Passos:** {}  \n\n", steps.len()));
    md.push_str("---\n\n");

    let assets_folder = format!("{}_steps", filename_base);

    for step in steps {
        let time = chrono::DateTime::parse_from_rfc3339(&step.timestamp)
            .map(|d| d.format("%H:%M:%S").to_string())
            .unwrap_or_else(|_| step.timestamp.clone());

        let action_label = match step.action_type {
            crate::session::ActionType::Click => "🖱 Clique",
            crate::session::ActionType::Focus => "🔍 Foco",
            _ => "➡ Ação",
        };

        md.push_str(&format!(
            "## Passo {} — {} | {} | {}\n\n",
            step.sequence, time, step.process_name, step.window_title
        ));
        md.push_str(&format!(
            "**Ação:** {}  \n**Monitor:** {}  \n\n",
            action_label, step.monitor_label
        ));

        let image_full_path = Path::new(sessions_dir)
            .join(&step.session_id)
            .join(&step.image_path);

        // Se há spotlight, renderiza versão com dim; caso contrário usa arquivo direto
        let image_bytes: Option<Vec<u8>> = if let Some(ref spot) = step.spotlight {
            crate::capture::render_spotlight(&image_full_path, spot).ok()
        } else {
            None
        };

        if embed_images {
            let bytes = image_bytes
                .or_else(|| fs::read(&image_full_path).ok());
            match bytes {
                Some(b) => {
                    let b64 = general_purpose::STANDARD.encode(&b);
                    md.push_str(&format!(
                        "![Passo {}](data:image/png;base64,{})\n\n",
                        step.sequence, b64
                    ));
                }
                None => {
                    md.push_str(&format!("> ⚠️ Imagem não encontrada\n\n"));
                }
            }
        } else {
            md.push_str(&format!(
                "![Passo {}](./{}/step_{:03}.png)\n\n",
                step.sequence, assets_folder, step.sequence
            ));
        }

        if let Some(annotation) = &step.annotation {
            md.push_str(&format!("> 💬 **Anotação:** {}\n\n", annotation));
        }

        if let Some(snippet) = &step.log_snippet {
            let ts = if snippet.captured_at.len() >= 19 {
                &snippet.captured_at[11..19]
            } else {
                snippet.captured_at.as_str()
            };
            md.push_str(&format!("> 📋 **Log** ({})\n\n", ts));
            md.push_str("```log\n");
            md.push_str(&snippet.text);
            md.push_str("\n```\n\n");
            if let Some(note) = &snippet.note {
                md.push_str(&format!("> 📝 **Nota:** {}\n\n", note));
            }
        }

        md.push_str("---\n\n");
    }

    md.push_str("*Gerado por Strider*\n");

    let output_path = Path::new(output_file);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir: {}", e))?;
    }
    fs::write(output_path, md).map_err(|e| format!("Erro ao salvar Markdown: {}", e))?;

    if !embed_images {
        let steps_src = Path::new(sessions_dir).join(&session.id).join("steps");
        let steps_dst = output_path
            .parent()
            .unwrap_or(Path::new("."))
            .join(&assets_folder);
        if steps_src.exists() {
            copy_steps_with_spotlight(&steps_dst, steps, sessions_dir)?;
        }
    }

    Ok(())
}

fn copy_steps_with_spotlight(
    steps_dst: &Path,
    steps: &[Step],
    sessions_dir: &str,
) -> Result<(), String> {
    fs::create_dir_all(steps_dst).map_err(|e| e.to_string())?;

    for step in steps {
        let src = Path::new(sessions_dir)
            .join(&step.session_id)
            .join(&step.image_path);
        let filename = format!("step_{:03}.png", step.sequence);
        let dst = steps_dst.join(&filename);

        if let Some(ref spot) = step.spotlight {
            if let Ok(bytes) = crate::capture::render_spotlight(&src, spot) {
                fs::write(&dst, bytes).map_err(|e| e.to_string())?;
                continue;
            }
        }
        if src.exists() {
            fs::copy(&src, &dst).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
