import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import { Loading } from './components/ui';

// Home is eager (first paint); everything else is code-split.
const About = lazy(() => import('./pages/About'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Services = lazy(() => import('./pages/Services'));
const Journey = lazy(() => import('./pages/Journey'));
const Blog = lazy(() => import('./pages/Blog'));
const BlogPost = lazy(() => import('./pages/BlogPost'));
const BlogTag = lazy(() => import('./pages/BlogTag'));
const Pay = lazy(() => import('./pages/Pay'));
const Testimonials = lazy(() => import('./pages/Testimonials'));
const Contact = lazy(() => import('./pages/Contact'));
const Book = lazy(() => import('./pages/Book'));
const StartProject = lazy(() => import('./pages/StartProject'));
const AdminApp = lazy(() => import('./admin/AdminApp'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Old /insights links keep working and forward to /blog.
const OldPost = () => <Navigate to={`/blog/${useParams().slug}`} replace />;

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="about" element={<About />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:slug" element={<ProjectDetail />} />
          <Route path="services" element={<Services />} />
          <Route path="experience" element={<Journey />} />
          <Route path="blog" element={<Blog />} />
          <Route path="blog/tag/:tag" element={<BlogTag />} />
          <Route path="blog/:slug" element={<BlogPost />} />
          <Route path="insights" element={<Navigate to="/blog" replace />} />
          <Route path="insights/:slug" element={<OldPost />} />
          <Route path="pay" element={<Pay />} />
          <Route path="testimonials" element={<Testimonials />} />
          <Route path="contact" element={<Contact />} />
          <Route path="book" element={<Book />} />
          <Route path="start-project" element={<StartProject />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        {/* Admin renders its own shell, outside the public layout. */}
        <Route path="admin/*" element={<AdminApp />} />
      </Routes>
    </Suspense>
  );
}
