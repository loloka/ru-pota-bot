import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[WebApp ErrorBoundary]:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 my-8 rounded-3xl glass-card border border-rose-500/30 text-center space-y-4 max-w-md mx-auto animate-fade-in">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/20 text-rose-500 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Не удалось загрузить раздел
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {this.state.error?.message || 'Произошла непредвиденная ошибка интерфейса'}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-emerald-500 hover:bg-emerald-600 transition active:scale-95 cursor-pointer shadow-md"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Обновить</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
