export type ActionType = 'focus' | 'click' | 'scroll' | 'drag';

export interface Highlight {
  kind: 'point' | 'rect';
  x: number;
  y: number;
  w?: number;
  h?: number;
  color: string;
}

export interface LogSnippet {
  text: string;
  note?: string;
  captured_at: string;
}

export interface Spotlight {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Step {
  id: string;
  session_id: string;
  timestamp: string;
  sequence: number;
  action_type: ActionType;
  process_name: string;
  window_title: string;
  monitor_id: number;
  monitor_label: string;
  image_path: string;
  annotation?: string;
  log_snippet?: LogSnippet;
  highlight?: Highlight;
  spotlight?: Spotlight;
}

export interface Session {
  id: string;
  started_at: string;
  ended_at?: string;
  steps: Step[];
}

export interface SessionMeta {
  id: string;
  started_at: string;
  ended_at?: string;
  step_count: number;
}

export type AppStatus = 'idle' | 'recording' | 'paused';

export interface AppConfig {
  sessions_dir: string;
  hotkey_start: string;
  hotkey_pause: string;
  hotkey_stop: string;
  hotkey_annotate: string;
  hotkey_capture: string;
  image_quality: string;
  default_export_format: string;
  embed_images_default: boolean;
  export_name_template: string;
  auto_purge_hours: number;
}
