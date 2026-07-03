import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/atom-one-dark.css'
import { resolveSrc, isVideo } from '@/lib/path'

export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose-custom">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        components={{
          a: ({ href, children, ...props }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          ),
          img: ({ src, alt, ...props }) => {
            const resolved = resolveSrc(src ?? '')
            if (isVideo(src ?? '')) {
              return <video src={resolved} controls className="w-full rounded-lg" />
            }
            return <img src={resolved} alt={alt || ''} loading="lazy" {...props} />
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
