import { beforeEach, describe, expect, it } from 'vitest';
import {
  getModelScope,
  setModelScope,
  getOpenAiKey,
  setOpenAiKey
} from '../src/utils/storage.js';

beforeEach(() => {
  localStorage.clear();
});

describe('model scope helpers', () => {
  it('defaults to rolling scope', () => {
    expect(getModelScope()).toBe('rolling');
  });

  it('persists scope choice', () => {
    setModelScope('all');
    expect(getModelScope()).toBe('all');
  });
});

describe('openai key helpers', () => {
  it('returns null when nothing is stored', () => {
    expect(getOpenAiKey()).toBe(null);
  });

  it('persists the key', () => {
    setOpenAiKey('test-key');
    expect(getOpenAiKey()).toBe('test-key');
  });
});
