use crate::session::{Highlight, HighlightKind, Spotlight};
use image::{DynamicImage, Rgba};
use std::path::Path;
use xcap::{Monitor, Window};

#[derive(Debug, Clone)]
pub struct WindowInfo {
    pub title: String,
    pub process_name: String,
    pub monitor_id: u32,
    pub monitor_label: String,
}

/// Captura uma janela pelo HWND.
/// Se `allow_fallback` e o HWND sumir, tenta a janela externa mais ao topo.
/// Caso contrário, falha com erro explícito (importante para captura manual).
pub fn capture_by_hwnd(
    hwnd_val: isize,
    output_path: &Path,
    allow_fallback: bool,
) -> Result<WindowInfo, String> {
    let own_pid = std::process::id();
    let windows = Window::all().map_err(|e| format!("Falha ao listar janelas: {}", e))?;

    let target = windows.iter().find(|w| {
        w.id().map(|id| id as isize == hwnd_val).unwrap_or(false)
            && w.pid().unwrap_or(0) != own_pid
    });

    let focused = match target {
        Some(w) => w,
        None if allow_fallback => windows
            .iter()
            .find(|w| {
                !w.is_minimized().unwrap_or(true)
                    && !w.title().unwrap_or_default().is_empty()
                    && w.pid().unwrap_or(0) != own_pid
            })
            .ok_or_else(|| "Nenhuma janela válida encontrada".to_string())?,
        None => {
            return Err(
                "Janela alvo não está mais visível. Traga-a para frente antes.".to_string(),
            );
        }
    };

    let image = focused
        .capture_image()
        .map_err(|e| format!("Falha ao capturar janela: {}", e))?;

    if is_blank(&image) {
        return Err("Imagem capturada em branco".to_string());
    }

    image
        .save(output_path)
        .map_err(|e| format!("Falha ao salvar imagem: {}", e))?;

    let (monitor_id, monitor_label) = detect_monitor(focused);

    Ok(WindowInfo {
        title: focused.title().unwrap_or_default(),
        process_name: focused.app_name().unwrap_or_default(),
        monitor_id,
        monitor_label,
    })
}

fn is_blank(img: &image::RgbaImage) -> bool {
    let samples = 200usize.min((img.width() * img.height()) as usize);
    if samples == 0 {
        return true;
    }
    let step = ((img.width() * img.height()) as usize / samples).max(1);
    let first = img.as_raw().get(0..4).map(|s| [s[0], s[1], s[2], s[3]]);
    let Some(ref_px) = first else { return true };
    let mut same = 0usize;
    let mut total = 0usize;
    for i in (0..img.as_raw().len()).step_by(step * 4) {
        if i + 3 >= img.as_raw().len() {
            break;
        }
        total += 1;
        if img.as_raw()[i] == ref_px[0]
            && img.as_raw()[i + 1] == ref_px[1]
            && img.as_raw()[i + 2] == ref_px[2]
        {
            same += 1;
        }
    }
    total > 0 && (same as f32 / total as f32) > 0.99
}

fn detect_monitor(window: &Window) -> (u32, String) {
    let wx = window.x().unwrap_or(0);
    let wy = window.y().unwrap_or(0);
    let ww = window.width().unwrap_or(0) as i32;
    let wh = window.height().unwrap_or(0) as i32;
    let cx = wx + ww / 2;
    let cy = wy + wh / 2;

    let monitors = match Monitor::all() {
        Ok(m) => m,
        Err(_) => return (0, "Monitor principal".to_string()),
    };

    for (idx, mon) in monitors.iter().enumerate() {
        let mx = mon.x().unwrap_or(0);
        let my = mon.y().unwrap_or(0);
        let mw = mon.width().unwrap_or(0) as i32;
        let mh = mon.height().unwrap_or(0) as i32;
        if cx >= mx && cx < mx + mw && cy >= my && cy < my + mh {
            return (
                idx as u32 + 1,
                format!("Monitor {} ({}x{})", idx + 1, mw, mh),
            );
        }
    }
    (0, "Monitor principal".to_string())
}

pub fn apply_highlight(image_path: &Path, highlight: &Highlight) -> Result<(), String> {
    use imageproc::drawing::{draw_filled_circle_mut, draw_hollow_rect_mut};
    use imageproc::rect::Rect;

    let mut img = image::open(image_path).map_err(|e| format!("Erro ao abrir imagem: {}", e))?;
    let (r, g, b) = parse_hex_color(&highlight.color).unwrap_or((255, 107, 53));
    let color = Rgba([r, g, b, 255u8]);

    match &mut img {
        DynamicImage::ImageRgba8(buf) => match highlight.kind {
            HighlightKind::Point => {
                draw_filled_circle_mut(buf, (highlight.x as i32, highlight.y as i32), 24, color);
            }
            HighlightKind::Rect => {
                let rect = Rect::at(highlight.x as i32, highlight.y as i32).of_size(
                    highlight.w.unwrap_or(100.0) as u32,
                    highlight.h.unwrap_or(60.0) as u32,
                );
                for offset in 0..4 {
                    let r = Rect::at(
                        highlight.x as i32 - offset,
                        highlight.y as i32 - offset,
                    )
                    .of_size(
                        (rect.width() as i32 + offset * 2) as u32,
                        (rect.height() as i32 + offset * 2) as u32,
                    );
                    draw_hollow_rect_mut(buf, r, color);
                }
            }
        },
        _ => {
            let mut rgba = img.to_rgba8();
            match highlight.kind {
                HighlightKind::Point => {
                    draw_filled_circle_mut(
                        &mut rgba,
                        (highlight.x as i32, highlight.y as i32),
                        24,
                        color,
                    );
                }
                HighlightKind::Rect => {
                    let rect = Rect::at(highlight.x as i32, highlight.y as i32).of_size(
                        highlight.w.unwrap_or(100.0) as u32,
                        highlight.h.unwrap_or(60.0) as u32,
                    );
                    draw_hollow_rect_mut(&mut rgba, rect, color);
                }
            }
            img = DynamicImage::ImageRgba8(rgba);
        }
    }

    img.save(image_path)
        .map_err(|e| format!("Erro ao salvar: {}", e))?;
    Ok(())
}

/// Renderiza spotlight (dim externo + ROI claro) como bytes PNG, sem alterar o arquivo original.
pub fn render_spotlight(image_path: &Path, spot: &Spotlight) -> Result<Vec<u8>, String> {
    use std::io::Cursor;

    let img = image::open(image_path)
        .map_err(|e| format!("Erro ao abrir: {}", e))?
        .to_rgba8();

    let (iw, ih) = img.dimensions();
    let mut out = img.clone();

    // Escurece tudo a 40%
    for pixel in out.pixels_mut() {
        pixel[0] = (pixel[0] as f32 * 0.4) as u8;
        pixel[1] = (pixel[1] as f32 * 0.4) as u8;
        pixel[2] = (pixel[2] as f32 * 0.4) as u8;
    }

    // Restaura ROI do original
    let x0 = (spot.x as u32).min(iw);
    let y0 = (spot.y as u32).min(ih);
    let x1 = ((spot.x + spot.w) as u32).min(iw);
    let y1 = ((spot.y + spot.h) as u32).min(ih);

    for y in y0..y1 {
        for x in x0..x1 {
            *out.get_pixel_mut(x, y) = *img.get_pixel(x, y);
        }
    }

    let mut bytes = Vec::new();
    DynamicImage::ImageRgba8(out)
        .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
        .map_err(|e| format!("Erro ao encodar PNG: {}", e))?;

    Ok(bytes)
}

/// Marcador de clique semi-transparente (bola vermelha ~70% opaca).
/// Usa alpha-blending manual porque imageproc::draw_filled_circle_mut substitui pixels.
/// Raio padrão 22px com borda suave de 2px.
pub fn apply_click_marker(
    image_path: &Path,
    x: i32,
    y: i32,
    color_hex: &str,
    opacity: f32,
) -> Result<(), String> {
    let mut img = image::open(image_path)
        .map_err(|e| format!("Erro ao abrir imagem: {}", e))?
        .to_rgba8();
    let (iw, ih) = img.dimensions();
    let (r, g, b) = parse_hex_color(color_hex).unwrap_or((255, 0, 0));
    let alpha = opacity.clamp(0.0, 1.0);

    let radius: i32 = 22;
    let soft: f32 = 2.0;
    let r2 = (radius as f32) * (radius as f32);

    for dy in -radius..=radius {
        for dx in -radius..=radius {
            let d2 = (dx * dx + dy * dy) as f32;
            if d2 > r2 {
                continue;
            }
            let dist = d2.sqrt();
            let edge = ((radius as f32 - dist) / soft).clamp(0.0, 1.0);
            let a = alpha * edge;
            if a <= 0.0 {
                continue;
            }
            let px = x + dx;
            let py = y + dy;
            if px < 0 || py < 0 || (px as u32) >= iw || (py as u32) >= ih {
                continue;
            }
            let pixel = img.get_pixel_mut(px as u32, py as u32);
            pixel[0] = (r as f32 * a + pixel[0] as f32 * (1.0 - a)) as u8;
            pixel[1] = (g as f32 * a + pixel[1] as f32 * (1.0 - a)) as u8;
            pixel[2] = (b as f32 * a + pixel[2] as f32 * (1.0 - a)) as u8;
        }
    }

    DynamicImage::ImageRgba8(img)
        .save(image_path)
        .map_err(|e| format!("Erro ao salvar marcador: {}", e))?;
    Ok(())
}

/// Recorta a imagem para a região dada e salva no mesmo caminho (destrutivo).
/// highlight e spotlight do Step devem ser limpos pelo caller.
pub fn crop_image(image_path: &Path, x: u32, y: u32, w: u32, h: u32) -> Result<(), String> {
    let img = image::open(image_path)
        .map_err(|e| format!("Erro ao abrir imagem: {}", e))?;
    let cropped = img.crop_imm(x, y, w, h);
    cropped
        .save(image_path)
        .map_err(|e| format!("Erro ao salvar recorte: {}", e))?;
    Ok(())
}

fn parse_hex_color(hex: &str) -> Option<(u8, u8, u8)> {
    let s = hex.trim_start_matches('#');
    if s.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&s[0..2], 16).ok()?;
    let g = u8::from_str_radix(&s[2..4], 16).ok()?;
    let b = u8::from_str_radix(&s[4..6], 16).ok()?;
    Some((r, g, b))
}
