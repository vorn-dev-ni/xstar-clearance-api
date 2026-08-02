import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation';

/** Structured input for an error alert. All fields but `error` are optional. */
export interface TelegramErrorInput {
  /** Module / class / context the error came from, e.g. `ClearancePlansService`. */
  module?: string;
  /** Source filename the error was thrown from, e.g. `clearance-plans.service.ts`. */
  filename?: string;
  /** The thrown value — Error, string, or anything. */
  error: unknown;
  /** Optional HTTP request context, attached by the global exception filter. */
  context?: {
    method?: string;
    path?: string;
    status?: number;
    requestId?: string;
  };
}

/** Outcome of an awaited send — lets manual callers (e.g. the controller) report status. */
export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

/** Telegram sendMessage caps a message at 4096 chars. */
const MAX_MESSAGE_LENGTH = 4096;
/** Suppress re-sending an identical alert signature within this window (ms). */
const DEDUPE_COOLDOWN_MS = 60_000;
/** Abort a hung Telegram request after this long (ms). */
const SEND_TIMEOUT_MS = 5000;

/**
 * Pushes caught errors to a Telegram channel. Fire-and-forget: a broken alert
 * channel must never block a request or throw into the caller. Disabled (no-op)
 * when alerts are turned off or the bot token / chat id are unset.
 */
@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token?: string;
  private readonly chatId?: string;
  private readonly enabled: boolean;
  private readonly env: string;
  /** signature -> last-sent epoch ms, for dedupe. */
  private readonly recent = new Map<string, number>();

  constructor(config: ConfigService<Env, true>) {
    this.token = config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    this.chatId = config.get('TELEGRAM_CHAT_ID', { infer: true });
    this.env = config.get('NODE_ENV', { infer: true });
    const alertsEnabled = config.get('TELEGRAM_ALERTS_ENABLED', {
      infer: true,
    });
    this.enabled = alertsEnabled && !!this.token && !!this.chatId;
  }

  onModuleInit(): void {
    const alertsRequested = !!this.token || !!this.chatId;
    if (!this.enabled && alertsRequested) {
      this.logger.warn(
        'Telegram alerts enabled but TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID incomplete — alerts disabled.',
      );
    }
  }

  /**
   * Send an error alert. Never throws; safe to call from anywhere (services,
   * the global exception filter). Returns immediately — the network send runs
   * in the background.
   */
  notifyError(input: TelegramErrorInput): void {
    if (!this.enabled) return;

    const { message, stack } = describeError(input.error);
    const signature = `${input.context?.status ?? ''}:${firstStackLine(stack) || message}`;
    if (this.isDuplicate(signature)) return;

    void this.send(this.formatMessage(input, message, stack));
  }

  /**
   * Explicit manual send of a plain-text message — used by the test controller.
   * Ignores the dedupe and the TELEGRAM_ALERTS_ENABLED flag (it's a deliberate
   * action), but still requires a configured token + chat id. Returns the outcome.
   */
  async sendMessage(text: string): Promise<TelegramSendResult> {
    if (!this.token || !this.chatId) {
      return { ok: false, error: 'Telegram not configured' };
    }
    return this.send(text, false);
  }

  /**
   * Sends a canned alert that exercises the real error-formatting path — used by
   * the test controller to verify the channel end-to-end. Bypasses dedupe.
   */
  async sendTestAlert(): Promise<TelegramSendResult> {
    if (!this.token || !this.chatId) {
      return { ok: false, error: 'Telegram not configured' };
    }
    const error = new Error('Telegram test alert');
    const text = this.formatMessage(
      {
        module: 'TelegramController',
        filename: 'telegram.controller.ts',
        error,
        context: { status: 200 },
      },
      error.message,
      error.stack,
    );
    return this.send(text, true);
  }

  /** True if this signature was already sent within the cooldown window. */
  private isDuplicate(signature: string): boolean {
    const now = Date.now();
    const last = this.recent.get(signature);
    if (last !== undefined && now - last < DEDUPE_COOLDOWN_MS) return true;
    this.recent.set(signature, now);
    // Opportunistic cleanup so the map can't grow unbounded.
    if (this.recent.size > 500) {
      for (const [key, ts] of this.recent) {
        if (now - ts >= DEDUPE_COOLDOWN_MS) this.recent.delete(key);
      }
    }
    return false;
  }

  private formatMessage(
    input: TelegramErrorInput,
    message: string,
    stack?: string,
  ): string {
    const { module, filename, context } = input;
    const lines: string[] = [`🚨 <b>Backend error</b> [${esc(this.env)}]`];
    if (context?.status !== undefined)
      lines.push(`<b>Status:</b> ${context.status}`);
    if (context?.method || context?.path) {
      lines.push(
        `<b>Request:</b> ${esc(context.method ?? '')} ${esc(context.path ?? '')}`.trim(),
      );
    }
    if (module) lines.push(`<b>Module:</b> ${esc(module)}`);
    if (filename) lines.push(`<b>File:</b> ${esc(filename)}`);
    if (context?.requestId)
      lines.push(`<b>Request ID:</b> <code>${esc(context.requestId)}</code>`);
    lines.push(`<b>Error:</b> ${esc(message)}`);

    let text = lines.join('\n');
    if (stack) {
      // Reserve room for the <pre> wrapper and truncation marker.
      const budget = MAX_MESSAGE_LENGTH - text.length - 40;
      if (budget > 0) {
        const trimmed =
          stack.length > budget ? `${stack.slice(0, budget)}\n…` : stack;
        text += `\n<pre>${esc(trimmed)}</pre>`;
      }
    }
    return text.length > MAX_MESSAGE_LENGTH
      ? text.slice(0, MAX_MESSAGE_LENGTH)
      : text;
  }

  private async send(text: string, html = true): Promise<TelegramSendResult> {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: this.chatId,
            text,
            disable_web_page_preview: true,
            ...(html ? { parse_mode: 'HTML' } : {}),
          }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const error = `${res.status} ${body}`.trim();
        this.logger.error(`Telegram sendMessage failed: ${error}`);
        return { ok: false, error };
      }
      return { ok: true };
    } catch (err) {
      const error = String(err);
      this.logger.error(`Failed to send Telegram alert: ${error}`);
      return { ok: false, error };
    }
  }
}

/** Escape the three characters Telegram's HTML parse mode is sensitive to. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Normalize any thrown value into a message + optional stack. */
function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack };
  }
  if (typeof error === 'string') return { message: error };
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

/** First non-empty stack frame line, used for the dedupe signature. */
function firstStackLine(stack?: string): string {
  if (!stack) return '';
  return (
    stack
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('at ')) ?? ''
  );
}
