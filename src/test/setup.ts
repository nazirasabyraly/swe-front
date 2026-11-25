import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import i18n from '../i18n';

// Component tests assert English copy.
void i18n.changeLanguage('en');

afterEach(() => cleanup());

// Deterministic object URLs so tests can assert which file an <img> shows.
URL.createObjectURL = (file: Blob) => `blob:mock/${(file as File).name ?? 'file'}`;
URL.revokeObjectURL = () => {};

window.scrollTo = () => {};

// jsdom has no <dialog> modal support; emulate the open/close behaviour we rely on.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

// Lazy-loaded routes import on first render; give async queries a little more room than 1s.
import { configure } from '@testing-library/react';
configure({ asyncUtilTimeout: 3000 });
