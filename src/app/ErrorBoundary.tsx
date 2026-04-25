import { Component, type ErrorInfo, type ReactNode } from 'react'

const LS_CATALOG = 'edu-viz.catalog.v1'

type Props = { children: ReactNode }

type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[EduViz]', error, info.componentStack)
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="error-boundary">
        <h1 className="error-boundary-title">页面无法打开</h1>
        <p className="error-boundary-msg">
          {error.message || String(error)}
        </p>
        <p className="error-boundary-hint">
          若你曾编辑过考点图谱，可能是本地保存的数据冲突或损坏。可清除本地数据后恢复为默认目录。
        </p>
        <button
          type="button"
          className="touch-btn"
          onClick={() => {
            try {
              localStorage.removeItem(LS_CATALOG)
            } catch {
              /* ignore */
            }
            window.location.reload()
          }}
        >
          清除本地图谱并刷新
        </button>
      </div>
    )
  }
}
