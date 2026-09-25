import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// Deterministic object URLs so tests can assert which file an <img> shows.
URL.createObjectURL = (file: Blob) => `blob:mock/${(file as File).name ?? 'file'}`;
URL.revokeObjectURL = () => {};

window.scrollTo = () => {};
