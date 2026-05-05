/**
 * Web server for the monitoring dashboard
 * Serves the UI and provides WebSocket for real-time metrics
 */

import { createServer } from 'node:http'
import type { Server as HTTPServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { getMetricsCollector } from './metrics.js'
import type { DashboardEvent, SubscriptionMessage } from './types.js'
import { logger } from '../../utils/logger.js'

export interface DashboardServerOptions {
  port?: number
  host?: string
}

export class DashboardServer {
  private httpServer: HTTPServer | null = null
  private wsServer: WebSocketServer | null = null
  private clients: Set<WebSocket> = new Set()
  private port: number
  private host: string
  private metricsCollector = getMetricsCollector()

  constructor(options: DashboardServerOptions = {}) {
    this.port = options.port || 8765
    this.host = options.host || 'localhost'
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create HTTP server
      this.httpServer = createServer((req, res) => {
        this.handleHTTPRequest(req, res)
      })

      // Create WebSocket server
      this.wsServer = new WebSocketServer({ server: this.httpServer })

      this.wsServer.on('connection', (ws) => {
        this.handleWebSocketConnection(ws)
      })

      this.wsServer.on('error', (error) => {
        logger.error('Dashboard', `WebSocket server error: ${error.message}`)
      })

      // Listen for metrics events
      this.metricsCollector.on('event', (event: DashboardEvent) => {
        this.broadcast(event)
      })

      // Start metrics snapshot broadcast (every 1 second)
      setInterval(() => {
        this.broadcast({
          type: 'metrics:snapshot',
          data: this.metricsCollector.getAggregateMetrics(),
        })
      }, 1000)

      // Start server
      this.httpServer.listen(this.port, this.host, () => {
        logger.info('Dashboard', `Dashboard server started at http://${this.host}:${this.port}`)
        resolve()
      })

      this.httpServer.on('error', (error) => {
        logger.error('Dashboard', `HTTP server error: ${error.message}`)
        reject(error)
      })
    })
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all WebSocket connections
      for (const client of this.clients) {
        client.close()
      }
      this.clients.clear()

      // Close WebSocket server
      if (this.wsServer) {
        this.wsServer.close(() => {
          logger.info('Dashboard', 'WebSocket server closed')
        })
      }

      // Close HTTP server
      if (this.httpServer) {
        this.httpServer.close(() => {
          logger.info('Dashboard', 'HTTP server closed')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  getURL(): string {
    return `http://${this.host}:${this.port}`
  }

  private handleHTTPRequest(req: any, res: any): void {
    const url = req.url || '/'

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    if (url === '/' || url === '/index.html') {
      this.serveHTML(res)
    } else if (url === '/api/history') {
      this.serveHistory(res)
    } else if (url === '/api/metrics') {
      this.serveMetrics(res)
    } else if (url === '/api/tools') {
      this.serveToolStats(res)
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
    }
  }

  private serveHTML(res: any): void {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(getDashboardHTML(this.port))
  }

  private serveHistory(res: any): void {
    const history = this.metricsCollector.getHistory()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(history))
  }

  private serveMetrics(res: any): void {
    const metrics = this.metricsCollector.getAggregateMetrics()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(metrics))
  }

  private serveToolStats(res: any): void {
    const toolStats = this.metricsCollector.getToolStats()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(toolStats))
  }

  private handleWebSocketConnection(ws: WebSocket): void {
    logger.info('Dashboard', 'WebSocket client connected')
    this.clients.add(ws)

    // Send initial data
    ws.send(JSON.stringify({
      type: 'metrics:history',
      data: this.metricsCollector.getHistory(),
    }))

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())
        this.handleWebSocketMessage(ws, message)
      } catch (error) {
        logger.error('Dashboard', `Failed to parse WebSocket message: ${error}`)
      }
    })

    ws.on('close', () => {
      logger.info('Dashboard', 'WebSocket client disconnected')
      this.clients.delete(ws)
    })

    ws.on('error', (error) => {
      logger.error('Dashboard', `WebSocket client error: ${error.message}`)
      this.clients.delete(ws)
    })
  }

  private handleWebSocketMessage(ws: WebSocket, message: any): void {
    if (message.type === 'subscribe') {
      // Client subscription handling (future enhancement)
      logger.info('Dashboard', `Client subscribed to: ${message.metrics?.join(', ') || 'all'}`)
    }
  }

  private broadcast(event: DashboardEvent): void {
    const message = JSON.stringify(event)
    for (const client of this.clients) {
      if (client.readyState === 1) { // OPEN
        try {
          client.send(message)
        } catch (error) {
          logger.error('Dashboard', `Failed to send to client: ${error}`)
        }
      }
    }
  }
}

// Singleton instance
let dashboardServerInstance: DashboardServer | null = null

export function getDashboardServer(options?: DashboardServerOptions): DashboardServer {
  if (!dashboardServerInstance) {
    dashboardServerInstance = new DashboardServer(options)
  }
  return dashboardServerInstance
}

export async function startDashboardServer(options?: DashboardServerOptions): Promise<DashboardServer> {
  const server = getDashboardServer(options)
  await server.start()
  return server
}

export async function stopDashboardServer(): Promise<void> {
  if (dashboardServerInstance) {
    await dashboardServerInstance.stop()
    dashboardServerInstance = null
  }
}

// HTML for the dashboard UI
function getDashboardHTML(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code Monitoring Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
      padding: 20px;
    }

    .header {
      text-align: center;
      padding: 20px 0;
      border-bottom: 2px solid #333;
      margin-bottom: 30px;
    }

    .header h1 {
      font-size: 28px;
      color: #fff;
      margin-bottom: 5px;
    }

    .header p {
      color: #888;
      font-size: 14px;
    }

    .status {
      display: inline-block;
      padding: 4px 12px;
      background: #1a4d2e;
      color: #4ade80;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 10px;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .metric-card {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 20px;
    }

    .metric-card h3 {
      font-size: 14px;
      color: #888;
      margin-bottom: 10px;
      text-transform: uppercase;
      font-weight: 600;
    }

    .metric-value {
      font-size: 32px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 5px;
    }

    .metric-label {
      font-size: 12px;
      color: #666;
    }

    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .chart-card {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 20px;
    }

    .chart-card h3 {
      font-size: 16px;
      color: #fff;
      margin-bottom: 15px;
      font-weight: 600;
    }

    .chart-container {
      position: relative;
      height: 250px;
    }

    .query-timeline {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .query-timeline h3 {
      font-size: 16px;
      color: #fff;
      margin-bottom: 15px;
      font-weight: 600;
    }

    .query-item {
      padding: 10px;
      margin-bottom: 8px;
      background: #252525;
      border-radius: 6px;
      border-left: 3px solid #4ade80;
    }

    .query-item.error {
      border-left-color: #ef4444;
    }

    .query-item.in-progress {
      border-left-color: #3b82f6;
    }

    .query-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
    }

    .query-id {
      font-weight: 600;
      color: #fff;
      font-size: 14px;
    }

    .query-duration {
      color: #888;
      font-size: 12px;
    }

    .query-meta {
      font-size: 12px;
      color: #666;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .live-indicator {
      animation: pulse 2s infinite;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Claude Code Monitoring Dashboard</h1>
    <p>Real-time metrics and query visualization <span class="status live-indicator">● LIVE</span></p>
  </div>

  <div class="metrics-grid">
    <div class="metric-card">
      <h3>Queries</h3>
      <div class="metric-value" id="totalQueries">0</div>
      <div class="metric-label"><span id="activeQueries">0</span> active</div>
    </div>

    <div class="metric-card">
      <h3>API Requests</h3>
      <div class="metric-value" id="totalAPIRequests">0</div>
      <div class="metric-label"><span id="activeAPIRequests">0</span> active</div>
    </div>

    <div class="metric-card">
      <h3>Token Usage</h3>
      <div class="metric-value" id="totalTokens">0</div>
      <div class="metric-label">Input: <span id="inputTokens">0</span> | Output: <span id="outputTokens">0</span></div>
    </div>

    <div class="metric-card">
      <h3>Total Cost</h3>
      <div class="metric-value" id="totalCost">$0.00</div>
      <div class="metric-label">Cache savings: <span id="cacheSavings">$0.00</span></div>
    </div>

    <div class="metric-card">
      <h3>Avg TTFT</h3>
      <div class="metric-value" id="avgTTFT">0ms</div>
      <div class="metric-label">Time to first token</div>
    </div>

    <div class="metric-card">
      <h3>Cache Hit Rate</h3>
      <div class="metric-value" id="cacheHitRate">0%</div>
      <div class="metric-label">Prompt caching efficiency</div>
    </div>
  </div>

  <div class="query-timeline">
    <h3>Recent Queries</h3>
    <div id="queryList">
      <p style="color: #666; text-align: center; padding: 20px;">Waiting for queries...</p>
    </div>
  </div>

  <div class="charts-grid">
    <div class="chart-card">
      <h3>Token Usage Over Time</h3>
      <div class="chart-container">
        <canvas id="tokenChart"></canvas>
      </div>
    </div>

    <div class="chart-card">
      <h3>API Latency Distribution</h3>
      <div class="chart-container">
        <canvas id="latencyChart"></canvas>
      </div>
    </div>

    <div class="chart-card">
      <h3>Tool Execution Stats</h3>
      <div class="chart-container">
        <canvas id="toolChart"></canvas>
      </div>
    </div>

    <div class="chart-card">
      <h3>Cache Performance</h3>
      <div class="chart-container">
        <canvas id="cacheChart"></canvas>
      </div>
    </div>
  </div>

  <script>
    // WebSocket connection
    const ws = new WebSocket('ws://localhost:${port}');

    let queries = [];
    let apiCalls = [];
    let toolCalls = [];

    // Charts
    let tokenChart, latencyChart, toolChart, cacheChart;

    ws.onopen = () => {
      console.log('Connected to dashboard server');
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleMessage(message);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Disconnected from dashboard server');
      setTimeout(() => location.reload(), 3000);
    };

    function handleMessage(message) {
      switch (message.type) {
        case 'metrics:history':
          initializeCharts(message.data);
          queries = message.data.queries;
          apiCalls = message.data.apiCalls;
          toolCalls = message.data.toolCalls;
          updateUI(message.data.aggregates);
          updateQueryList();
          break;

        case 'metrics:snapshot':
          updateUI(message.data);
          break;

        case 'query:start':
          queries.push(message.data);
          updateQueryList();
          break;

        case 'query:end':
          const idx = queries.findIndex(q => q.id === message.data.id);
          if (idx >= 0) queries[idx] = message.data;
          updateQueryList();
          break;

        case 'api:end':
          apiCalls.push(message.data);
          updateCharts();
          break;

        case 'tool:end':
          toolCalls.push(message.data);
          updateCharts();
          break;
      }
    }

    function updateUI(metrics) {
      document.getElementById('totalQueries').textContent = metrics.totalQueries;
      document.getElementById('activeQueries').textContent = metrics.activeQueries;
      document.getElementById('totalAPIRequests').textContent = metrics.totalAPIRequests;
      document.getElementById('activeAPIRequests').textContent = metrics.activeAPIRequests;
      document.getElementById('totalTokens').textContent = formatNumber(metrics.totalInputTokens + metrics.totalOutputTokens);
      document.getElementById('inputTokens').textContent = formatNumber(metrics.totalInputTokens);
      document.getElementById('outputTokens').textContent = formatNumber(metrics.totalOutputTokens);
      document.getElementById('totalCost').textContent = '$' + metrics.totalCost.toFixed(3);
      document.getElementById('avgTTFT').textContent = Math.round(metrics.averageTTFT) + 'ms';
      document.getElementById('cacheHitRate').textContent = Math.round(metrics.cacheHitRate * 100) + '%';

      // Calculate cache savings
      const fullCost = (metrics.totalCacheReadTokens * 0.003) / 1000;
      const actualCost = (metrics.totalCacheReadTokens * 0.0003) / 1000;
      const savings = fullCost - actualCost;
      document.getElementById('cacheSavings').textContent = '$' + savings.toFixed(3);
    }

    function updateQueryList() {
      const list = document.getElementById('queryList');
      const recentQueries = queries.slice(-10).reverse();

      if (recentQueries.length === 0) {
        list.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">Waiting for queries...</p>';
        return;
      }

      list.innerHTML = recentQueries.map(q => {
        const duration = q.endTime ? new Date(q.endTime) - new Date(q.startTime) : 0;
        const statusClass = q.status === 'error' ? 'error' : q.status === 'in_progress' ? 'in-progress' : '';

        return \`
          <div class="query-item \${statusClass}">
            <div class="query-header">
              <span class="query-id">Query #\${q.id.slice(0, 8)}</span>
              <span class="query-duration">\${duration ? (duration/1000).toFixed(2) + 's' : 'In progress...'}</span>
            </div>
            <div class="query-meta">
              API: \${q.apiCalls.length} | Tools: \${q.toolCalls.length} |
              Tokens: \${formatNumber(q.totalTokens)} | Cost: $\${q.totalCost.toFixed(3)}
            </div>
          </div>
        \`;
      }).join('');
    }

    function initializeCharts(data) {
      // Token chart
      tokenChart = new Chart(document.getElementById('tokenChart'), {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Input Tokens',
            data: [],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.3
          }, {
            label: 'Output Tokens',
            data: [],
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            tension: 0.3
          }]
        },
        options: getChartOptions()
      });

      // Latency chart
      latencyChart = new Chart(document.getElementById('latencyChart'), {
        type: 'bar',
        data: {
          labels: ['TTFT', 'Total Duration'],
          datasets: [{
            label: 'Average (ms)',
            data: [0, 0],
            backgroundColor: ['#4ade80', '#f59e0b']
          }]
        },
        options: getChartOptions()
      });

      // Tool chart
      toolChart = new Chart(document.getElementById('toolChart'), {
        type: 'bar',
        data: {
          labels: [],
          datasets: [{
            label: 'Executions',
            data: [],
            backgroundColor: '#8b5cf6'
          }]
        },
        options: getChartOptions()
      });

      // Cache chart
      cacheChart = new Chart(document.getElementById('cacheChart'), {
        type: 'doughnut',
        data: {
          labels: ['Cache Hits', 'Cache Misses'],
          datasets: [{
            data: [0, 0],
            backgroundColor: ['#4ade80', '#ef4444']
          }]
        },
        options: getChartOptions()
      });

      updateCharts();
    }

    function updateCharts() {
      if (!tokenChart) return;

      // Update latency chart
      latencyChart.data.datasets[0].data = [
        apiCalls.reduce((sum, c) => sum + (c.ttftMs || 0), 0) / (apiCalls.length || 1),
        apiCalls.reduce((sum, c) => sum + (c.totalDurationMs || 0), 0) / (apiCalls.length || 1)
      ];
      latencyChart.update();

      // Update tool chart
      const toolStats = {};
      toolCalls.forEach(t => {
        toolStats[t.toolName] = (toolStats[t.toolName] || 0) + 1;
      });
      toolChart.data.labels = Object.keys(toolStats);
      toolChart.data.datasets[0].data = Object.values(toolStats);
      toolChart.update();

      // Update cache chart
      const totalCache = apiCalls.reduce((sum, c) => sum + (c.cacheReadTokens || 0) + (c.cacheCreationTokens || 0), 0);
      const cacheHits = apiCalls.reduce((sum, c) => sum + (c.cacheReadTokens || 0), 0);
      cacheChart.data.datasets[0].data = [cacheHits, totalCache - cacheHits];
      cacheChart.update();
    }

    function getChartOptions() {
      return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#e0e0e0' }
          }
        },
        scales: {
          x: { ticks: { color: '#888' }, grid: { color: '#333' } },
          y: { ticks: { color: '#888' }, grid: { color: '#333' } }
        }
      };
    }

    function formatNumber(num) {
      return num >= 1000 ? (num / 1000).toFixed(1) + 'K' : num.toString();
    }
  </script>
</body>
</html>`;
}
