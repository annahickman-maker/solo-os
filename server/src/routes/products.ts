/**
 * Products - 07_Products/Gumroad/products/<id>.md
 */

import { createFileRoute, slugify, todayISO } from './_factory.js';

type ProductFrontmatter = {
  id?: string;
  type: 'product';
  name: string;
  product_type?: 'paid' | 'free';
  price?: number;
  reviews?: number;
  rating?: number | null;
  monthly_revenue?: number;
  status: 'active' | 'parked' | 'sunset';
  created?: string;
  updated?: string;
};

type ProductResponse = {
  id: string;
  name: string;
  product_type: 'paid' | 'free';
  price: number;
  reviews: number;
  rating: number | null;
  monthly_revenue: number;
  status: ProductFrontmatter['status'];
  description: string;
  source_file: string;
  updated_at: number;
};

export default createFileRoute<ProductFrontmatter, ProductResponse>({
  folder: '07_Products/Gumroad/products',
  type: 'product',
  toResponse: (entry) => {
    const fm = entry.frontmatter;
    if (fm?.type !== 'product') return null;
    const body = entry.body.replace(/^#\s+.+?\n/, '').trim();
    return {
      id: fm.id ?? entry.id,
      name: fm.name ?? entry.id,
      product_type: fm.product_type ?? 'paid',
      price: typeof fm.price === 'number' ? fm.price : 0,
      reviews: fm.reviews ?? 0,
      rating: fm.rating ?? null,
      monthly_revenue: fm.monthly_revenue ?? 0,
      status: fm.status ?? 'active',
      description: body,
      source_file: entry.relPath,
      updated_at: entry.mtimeSec,
    };
  },
  fromCreate: (body) => {
    if (!body?.name) return null;
    const id = `product-${slugify(body.name)}`;
    const today = todayISO();
    return {
      id,
      frontmatter: {
        id,
        type: 'product',
        name: body.name,
        product_type: body.product_type ?? 'paid',
        price: body.price ?? 0,
        reviews: body.reviews ?? 0,
        rating: body.rating ?? null,
        monthly_revenue: body.monthly_revenue ?? 0,
        status: body.status ?? 'active',
        created: today,
        updated: today,
      },
      body: `# ${body.name}\n${body.description ? `\n${body.description}\n` : ''}`,
    };
  },
  applyPatch: (entry, body) => {
    const fm = { ...entry.frontmatter };
    for (const k of ['name', 'product_type', 'price', 'reviews', 'rating', 'monthly_revenue', 'status'] as const) {
      if (body[k] !== undefined) (fm as any)[k] = body[k];
    }
    fm.updated = todayISO();
    let newBody = entry.body;
    if (body.name !== undefined) newBody = `# ${body.name}\n${entry.body.replace(/^#\s+.+?\n/, '')}`;
    if (body.description !== undefined) {
      const heading = newBody.match(/^#\s+.+?\n/)?.[0] ?? `# ${fm.name}\n`;
      newBody = `${heading}\n${body.description}\n`;
    }
    return { frontmatter: fm, body: newBody };
  },
  applyFilters: (items, q) => {
    if (q.product_type) items = items.filter((x) => x.product_type === q.product_type);
    if (q.status) items = items.filter((x) => x.status === q.status);
    return items;
  },
  sort: (a, b) => b.monthly_revenue - a.monthly_revenue || b.reviews - a.reviews,
});
