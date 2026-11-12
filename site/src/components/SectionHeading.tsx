interface Props {
  eyebrow: string
  title: string
  lede?: string
}

export default function SectionHeading({ eyebrow, title, lede }: Props) {
  return (
    <header className="section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {lede && <p className="lede">{lede}</p>}
    </header>
  )
}
