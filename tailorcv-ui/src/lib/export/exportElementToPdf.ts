type Html2PdfFactory = () => {
  from: (el: HTMLElement) => any
  set: (opts: Record<string, unknown>) => any
  save: (filename?: string) => Promise<void>
}

async function loadHtml2Pdf(): Promise<Html2PdfFactory> {
  const mod: any = await import('html2pdf.js')
  return (mod?.default ?? mod) as Html2PdfFactory
}

async function waitForFonts() {
  const anyDoc = document as any
  if (anyDoc?.fonts?.ready) {
    try {
      await anyDoc.fonts.ready
    } catch {
      // ignore and proceed
    }
  }
  // Allow layout to settle after fonts load.
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
}

export async function exportElementToPdf(element: HTMLElement, filename: string) {
  const html2pdf = await loadHtml2Pdf()
  await waitForFonts()

  const opt = {
    margin: 10,
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css'] },
  } as const

  await html2pdf().set(opt).from(element).save()
}

