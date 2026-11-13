import React, { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI error boundary caught:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md text-center space-y-3 p-6 rounded-2xl border border-red-800 bg-red-950/40">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
          <h2 className="text-white font-bold">{this.props.label || 'Something went wrong'}</h2>
          <p className="text-xs text-red-200">{String(this.state.error.message || this.state.error)}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white border border-slate-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
