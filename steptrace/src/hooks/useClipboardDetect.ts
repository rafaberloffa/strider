import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import {
  Toast, ToastTitle, ToastBody, Button, Text,
  useToastController,
} from '@fluentui/react-components';
import type { Step } from '../types';
import React from 'react';

type DispatchToast = ReturnType<typeof useToastController>['dispatchToast'];

interface Options {
  onAttach: (stepId: string, logText: string) => Promise<void>;
  dispatchToast: DispatchToast;
}

export function useClipboardDetect({ onAttach, dispatchToast }: Options) {
  const lastLogRef = useRef('');

  useEffect(() => {
    const unlisten = listen<string>('log-detected', e => {
      const logText = e.payload;
      if (logText === lastLogRef.current) return;
      lastLogRef.current = logText;

      dispatchToast(
        React.createElement(Toast, null,
          React.createElement(ToastTitle, {
            action: React.createElement(Button, {
              appearance: 'primary' as const,
              size: 'small' as const,
              onClick: async () => {
                const currentSteps = await invoke<Step[]>('get_session_steps');
                if (currentSteps.length > 0) {
                  const last = currentSteps[currentSteps.length - 1];
                  await onAttach(last.id, logText);
                }
              },
            }, 'Anexar'),
          }, 'Log detectado no clipboard'),
          React.createElement(ToastBody, null,
            React.createElement(Text, { size: 100, style: { fontFamily: 'monospace' } },
              logText.slice(0, 120) + (logText.length > 120 ? '…' : '')
            )
          )
        ),
        { intent: 'info', timeout: 8000 }
      );
    });
    return () => { unlisten.then(fn => fn()); };
  }, [onAttach, dispatchToast]);
}
