import type { MetadataRoute } from 'next';

// Nothing is indexed for now.
export default function robots(): MetadataRoute.Robots {
  // /svc/ stays disallowed after the site opens: it is the api service's internal surface.
  return { rules: [{ userAgent: '*', disallow: ['/', '/svc/'] }] };
}
