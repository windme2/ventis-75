'use client';

import { Component, type ReactNode } from 'react';

/** If the 3D scene throws (for example, the GPU refuses a context), render nothing and report it. */
export default class GLBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
