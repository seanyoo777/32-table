import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props { children: ReactNode; fallbackLabel?: string }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
          <AlertTriangle size={48} className="text-red-400" />
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-1">
              {this.props.fallbackLabel ?? '페이지'} 오류
            </h2>
            <p className="text-sm text-gray-400 max-w-md">{this.state.error.message}</p>
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <RefreshCw size={14} /> 다시 시도
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
