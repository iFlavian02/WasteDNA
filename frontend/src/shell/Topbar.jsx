import { useContext } from 'react'
import { createPortal } from 'react-dom'
import { TopbarContext } from './topbarContext.js'

/**
 * Renders its children (usually the page `<h1>` and filters) into the shell's
 * top bar. Pages that do not use it get the section name there instead and
 * keep their own heading in the content.
 */
export function TopbarPortal({ children }) {
  const slot = useContext(TopbarContext)
  return slot ? createPortal(children, slot) : null
}
