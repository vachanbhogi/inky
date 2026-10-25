import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const htmlPath = resolve(__dirname, '../index.html')
const htmlContent = readFileSync(htmlPath, 'utf-8')

const cssPath = resolve(__dirname, 'index.css')
const cssContent = readFileSync(cssPath, 'utf-8')

describe('App Title, Meta & Accessible Tags', () => {
  describe('index.html metadata', () => {
    it('sets the descriptive app title', () => {
      expect(htmlContent).toContain('<title>Inky — On-Device Handwritten Math Assistant</title>')
    })

    it('sets the meta description', () => {
      expect(htmlContent).toMatch(
        /<meta\s+name=["']description["']\s+content=["']Private, on-device handwritten math scratchpad and step-by-step solver\. 100% offline math learning\.["']\s*\/?>/,
      )
    })

    it('sets OpenGraph tags', () => {
      expect(htmlContent).toMatch(
        /<meta\s+property=["']og:title["']\s+content=["']Inky — On-Device Handwritten Math Assistant["']\s*\/?>/,
      )
      expect(htmlContent).toMatch(
        /<meta\s+property=["']og:description["']\s+content=["']Private, on-device handwritten math scratchpad and step-by-step solver\. 100% offline math learning\.["']\s*\/?>/,
      )
      expect(htmlContent).toMatch(
        /<meta\s+property=["']og:type["']\s+content=["']website["']\s*\/?>/,
      )
      expect(htmlContent).toMatch(
        /<meta\s+property=["']og:image["']\s+content=["']\/favicon\.svg["']\s*\/?>/,
      )
      expect(htmlContent).toMatch(
        /<meta\s+property=["']og:site_name["']\s+content=["']Inky["']\s*\/?>/,
      )
    })

    it('sets Twitter card tags', () => {
      expect(htmlContent).toMatch(
        /<meta\s+name=["']twitter:card["']\s+content=["']summary["']\s*\/?>/,
      )
      expect(htmlContent).toMatch(
        /<meta\s+name=["']twitter:title["']\s+content=["']Inky — On-Device Handwritten Math Assistant["']\s*\/?>/,
      )
      expect(htmlContent).toMatch(
        /<meta\s+name=["']twitter:description["']\s+content=["']Private, on-device handwritten math scratchpad and step-by-step solver\. 100% offline math learning\.["']\s*\/?>/,
      )
    })

    it('sets theme-color matching canvas background', () => {
      expect(htmlContent).toMatch(
        /<meta\s+name=["']theme-color["']\s+content=["']#fbfbfa["']\s*\/?>/,
      )
    })

    it('sets Apple Web App tags', () => {
      expect(htmlContent).toMatch(
        /<meta\s+name=["']apple-mobile-web-app-capable["']\s+content=["']yes["']\s*\/?>/,
      )
      expect(htmlContent).toMatch(
        /<meta\s+name=["']apple-mobile-web-app-status-bar-style["']\s+content=["']default["']\s*\/?>/,
      )
    })
  })

  describe('src/index.css accessibility rules', () => {
    it('defines global :focus-visible styling with 2px #2563eb ring and 2px offset', () => {
      expect(cssContent).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid #2563eb;/)
      expect(cssContent).toMatch(/:focus-visible\s*\{[^}]*outline-offset:\s*2px;/)
    })

    it('removes focus outlines for non-keyboard pointer/stylus interactions', () => {
      expect(cssContent).toMatch(/:focus:not\(:focus-visible\)\s*\{[^}]*outline:\s*none;/)
    })
  })
})
