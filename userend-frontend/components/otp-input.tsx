'use client';

import { useRef, useEffect, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';

export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
}) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const [shake, setShake] = useState(false);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const commit = (next: string) => {
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  const handleChange = (index: number, raw: string) => {
    const clean = raw.replace(/\D/g, '');
    if (!clean) {
      commit(value.slice(0, index));
      return;
    }
    const chars = value.split('');
    // typing multiple chars (e.g. autofill) → spread forward
    const spread = clean.split('');
    for (let i = 0; i < spread.length && index + i < length; i++) {
      chars[index + i] = spread[i]!;
    }
    const next = chars.join('').slice(0, length);
    commit(next);
    const focusIdx = Math.min(index + spread.length, length - 1);
    inputsRef.current[focusIdx]?.focus();
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const chars = value.split('');
      if (chars[index]) {
        chars.splice(index, 1);
        commit(chars.join(''));
        inputsRef.current[index]?.focus();
      } else if (index > 0) {
        chars.splice(index - 1, 1);
        commit(chars.join(''));
        inputsRef.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    commit(pasted);
    inputsRef.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div
      className={`flex gap-2 justify-center ${shake ? 'animate-shake' : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && value.length === length) return;
      }}
    >
      {digits.map((digit, i) => (
        <Input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={length}
          className="h-12 w-11 text-center text-lg font-semibold tracking-widest"
        />
      ))}
    </div>
  );
}
