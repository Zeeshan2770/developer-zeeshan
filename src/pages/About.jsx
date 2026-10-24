import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { useSettings } from '../lib/SettingsContext';
import { Reveal } from '../components/ui';
import { safeUrl } from '../lib/validate';
import { altText, resized, srcSet } from '../lib/img';

const ABOUT = [
  'I’m Muhammad Zeeshan Haider, a student with a growing interest in programming, software engineering, and the ways technology can solve everyday problems.',
  'My interest in computer science started early. Over time, that curiosity grew into something practical: building websites, creating educational tools, and exploring how digital systems can make work easier for students, teachers, and organizations.',
  'My projects are part of my learning journey. Each one gives me a chance to explore a new problem, improve my technical skills, and understand how an idea moves from a concept to something people can interact with.',
  'I’m especially interested in educational technology, useful web applications, and eventually cybersecurity. I want to keep learning, take on more challenging problems, and build solutions that have a purpose beyond simply looking impressive.',
  'I’m still growing, and that is part of the story. This website is a record of what I’m building now, what I have learned so far, and where I want to go next.',
];

export default function About() {
  const s = useSettings();
  const img = safeUrl(s.profileImage);
  return (
    <>
      <SEO title="About" description={`The story behind ${s.name}: from curiosity to building digital systems.`} />
      <section className="page-hero">
        <div className="wrap">
          <span className="eyebrow">About</span>
          <h1>I’m not waiting for the perfect moment to <em>start building</em>.</h1>
          <p className="muted lead">Curiosity gets an idea started. Consistent work gives it a life.</p>
        </div>
      </section>

      <section className="section tight">
        <div className="wrap about-layout">
          <aside className="about-side">
            {img && <img src={resized(img, 640)} srcSet={srcSet(img, [320, 480, 640])} sizes="(max-width: 900px) 90vw, 360px" width="640" height="800" alt={altText(s.profileImageAlt, `Portrait of ${s.name}, ${s.title}`)} className="portrait" loading="lazy" decoding="async" />}
            <p className="mono muted">{s.title}</p>
            <p className="philosophy">{s.tagline}</p>
            <div className="btn-row">
              <Link to="/start-project" className="btn btn-primary btn-sm">Start a Project</Link>
              <Link to="/experience" className="btn btn-ghost btn-sm">See the journey</Link>
            </div>
          </aside>
          <div className="story">
            {(!s.story || s.story.length === 0) && (
              <Reveal as="article" className="chapter">
                <span className="eyebrow">A little about me</span>
                {ABOUT.map((para) => <p key={para.slice(0, 24)} className="about-p">{para}</p>)}
              </Reveal>
            )}
            {(s.story || []).map((chapter, i) => (
              <Reveal as="article" key={chapter.title} className="chapter">
                <span className="mono chapter-n">{String(i + 1).padStart(2, '0')}</span>
                <h2>{chapter.title}</h2>
                <p>{chapter.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
