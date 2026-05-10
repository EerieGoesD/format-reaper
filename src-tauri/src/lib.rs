mod commands;
mod converter;

use converter::ConversionManager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(ConversionManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::add_conversion,
            commands::start_queued_conversion,
            commands::cancel_conversion,
            commands::remove_conversion,
            commands::get_conversions,
            commands::probe_file,
            commands::check_ffmpeg,
            commands::check_ffprobe,
            commands::check_hwaccel,
            commands::get_default_output_dir,
            commands::show_in_folder,
            commands::reveal_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
