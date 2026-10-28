// Pie Chart showing sector market cap distribution (full-screen version)
export class PieChart {
  constructor(container) {
    this.container = container
    this.canvas = document.createElement('canvas')
    this.canvas.style.cssText = 'display:block;width:100%;height:100%'
    container.appendChild(this.canvas)

    this.stocks = []
    this.hoveredSector = null

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        try {
          const W = container.offsetWidth
          const H = container.offsetHeight
          if (W > 0 && H > 0) {
            this.canvas.width = W
            this.canvas.height = H
          }
        } catch (e) {
          console.warn('[PieChart] Failed to set canvas size:', e)
        }
      })
    }

    this._bindEvents()
  }

  update(stocks) {
    if (!stocks || stocks.length === 0) {
      this.stocks = []
      return
    }
    this.stocks = stocks
    this.render()
  }

  render() {
    if (!this.canvas || !this.canvas.getContext) return
    
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    
    let W = this.canvas.width
    let H = this.canvas.height
    
    if (W <= 0 || H <= 0) {
      const containerW = this.container.offsetWidth
      const containerH = this.container.offsetHeight
      if (containerW > 0 && containerH > 0) {
        W = containerW
        H = containerH
        this.canvas.width = W
        this.canvas.height = H
      } else {
        return
      }
    }
    
    ctx.clearRect(0, 0, W, H)
    
    // Compute sector totals
    const sectorMap = new Map()
    this.stocks.forEach(stock => {
      const sector = stock.sector || '其他'
      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, { name: sector, value: 0, count: 0 })
      }
      const sData = sectorMap.get(sector)
      sData.value += stock.marketCap || 0
      sData.count += 1
    })
    
    const sectors = Array.from(sectorMap.values())
      .sort((a, b) => b.value - a.value)
    
    const totalValue = sectors.reduce((sum, s) => sum + s.value, 0)
    
    if (totalValue === 0) return
    
    const centerX = W / 2
    const centerY = H / 2
    const radius = Math.min(W, H) * 0.35
    
    try {
      let startAngle = -Math.PI / 2
      const colors = ['#c41e3a', '#e63946', '#f77f88', '#a23b72', '#6a1b9a', '#5e35b1', '#3949ab', '#1e88e5', '#00acc1', '#009688']
      
      sectors.forEach((sector, idx) => {
        const sliceAngle = (sector.value / totalValue) * 2 * Math.PI
        const endAngle = startAngle + sliceAngle
        const midAngle = startAngle + sliceAngle / 2
        
        const color = colors[idx % colors.length]
        ctx.beginPath()
        ctx.moveTo(centerX, centerY)
        ctx.arc(centerX, centerY, radius, startAngle, endAngle)
        ctx.closePath()
        
        if (this.hoveredSector === sector.name) {
          ctx.fillStyle = this._lightenColor(color)
          ctx.shadowColor = 'rgba(0,0,0,0.3)'
          ctx.shadowBlur = 8
        } else {
          ctx.fillStyle = color
          ctx.shadowColor = 'transparent'
        }
        ctx.fill()
        
        ctx.strokeStyle = '#1c2236'
        ctx.lineWidth = 1.5
        ctx.stroke()
        
        // Draw label
        const labelRadius = radius * 0.65
        const labelX = centerX + Math.cos(midAngle) * labelRadius
        const labelY = centerY + Math.sin(midAngle) * labelRadius
        
        const pct = ((sector.value / totalValue) * 100).toFixed(1)
        ctx.font = 'bold 12px "JetBrains Mono"'
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.shadowColor = 'transparent'
        
        if (sector.name.length <= 6) {
          ctx.fillText(sector.name, labelX, labelY - 6)
          ctx.font = '10px "JetBrains Mono"'
          ctx.fillText(pct + '%', labelX, labelY + 8)
        } else {
          ctx.font = '10px "JetBrains Mono"'
          ctx.fillText(pct + '%', labelX, labelY)
        }
        
        startAngle = endAngle
      })
      
      // Draw center circle
      ctx.fillStyle = '#1e3148'
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius * 0.15, 0, 2 * Math.PI)
      ctx.fill()
      
      ctx.fillStyle = '#e8ecf5'
      ctx.font = 'bold 14px "JetBrains Mono"'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(this.stocks.length, centerX, centerY - 6)
      
      ctx.font = '11px "JetBrains Mono"'
      ctx.fillStyle = '#a0aab8'
      ctx.fillText('stocks', centerX, centerY + 10)
      
    } catch (e) {
      console.error('[PieChart] Render error:', e)
    }
  }

  _lightenColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, 0.8)`
  }

  _bindEvents() {
    this.canvas.addEventListener('mousemove', e => {
      const rect = this.canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const W = this.canvas.width
      const H = this.canvas.height
      
      const centerX = W / 2
      const centerY = H / 2
      const radius = Math.min(W, H) * 0.35
      
      const dx = x - centerX
      const dy = y - centerY
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      if (dist > radius * 0.15 && dist < radius) {
        const angle = Math.atan2(dy, dx)
        this._updateHovered(angle)
      } else {
        this.hoveredSector = null
        this.render()
      }
    })
    
    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredSector = null
      this.render()
    })
  }

  _updateHovered(angle) {
    const sectorMap = new Map()
    this.stocks.forEach(stock => {
      const sector = stock.sector || '其他'
      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, { name: sector, value: 0 })
      }
      sectorMap.get(sector).value += stock.marketCap || 0
    })
    
    const sectors = Array.from(sectorMap.values())
      .sort((a, b) => b.value - a.value)
    
    const totalValue = sectors.reduce((sum, s) => sum + s.value, 0)
    
    let startAngle = -Math.PI / 2
    for (const sector of sectors) {
      const sliceAngle = (sector.value / totalValue) * 2 * Math.PI
      const endAngle = startAngle + sliceAngle
      
      if (angle >= startAngle && angle <= endAngle) {
        if (this.hoveredSector !== sector.name) {
          this.hoveredSector = sector.name
          this.render()
        }
        break
      }
      startAngle = endAngle
    }
  }

  destroy() {
    try {
      if (this.canvas && this.canvas.parentElement) {
        this.canvas.parentElement.removeChild(this.canvas)
      }
    } catch (e) {
      console.warn('[PieChart] Destroy error:', e)
    }
  }
}
