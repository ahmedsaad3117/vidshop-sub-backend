import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PromptCategory,
  PromptTemplate,
  PromptTier,
  Subscription,
  User,
} from '../entities';
import { CreateTemplateDto } from './dto/create-template.dto';
import { TemplateQueryDto } from './dto/template-query.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class PromptsService implements OnModuleInit {
  constructor(
    @InjectRepository(PromptTemplate)
    private readonly templatesRepository: Repository<PromptTemplate>,
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultTemplates();
  }

  async getAllTemplates(
    query: TemplateQueryDto,
    userId?: string,
  ): Promise<PromptTemplate[]> {
    const canAccessPremium = await this.canAccessPremiumTemplates(userId);

    const qb = this.templatesRepository
      .createQueryBuilder('template')
      .where('template.isActive = :active', { active: true });

    if (query.category) {
      qb.andWhere('template.category = :category', { category: query.category });
    }

    if (!canAccessPremium) {
      qb.andWhere('template.tier = :tier', { tier: PromptTier.BASIC });
    }

    return qb.orderBy('template.sortOrder', 'ASC').getMany();
  }

  async getTemplateById(id: string, userId?: string): Promise<PromptTemplate> {
    const template = await this.templatesRepository.findOne({
      where: { id, isActive: true },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (template.tier === PromptTier.PREMIUM) {
      const canAccessPremium = await this.canAccessPremiumTemplates(userId);
      if (!canAccessPremium) {
        throw new ForbiddenException('Premium template access required');
      }
    }

    return template;
  }

  async resolvePrompt(
    templateId: string | null,
    customPrompt: string | null,
    productTitle: string,
    productDescription: string,
  ): Promise<string> {
    if (templateId) {
      const template = await this.templatesRepository.findOne({
        where: { id: templateId, isActive: true },
      });

      if (!template) {
        throw new NotFoundException('Template not found');
      }

      return template.promptText
        .replace(/\{\{PRODUCT_TITLE\}\}/g, productTitle)
        .replace(/\{\{PRODUCT_DESCRIPTION\}\}/g, productDescription);
    }

    if (customPrompt) {
      return customPrompt;
    }

    throw new BadRequestException('Either templateId or customPrompt is required');
  }

  async createTemplate(dto: CreateTemplateDto): Promise<PromptTemplate> {
    if (!dto.promptText.includes('{{PRODUCT_TITLE}}')) {
      throw new BadRequestException('promptText must contain {{PRODUCT_TITLE}} placeholder');
    }

    const template = this.templatesRepository.create({
      ...dto,
      sortOrder: dto.sortOrder ?? 999,
      isActive: true,
      thumbnailUrl: dto.thumbnailUrl ?? null,
      exampleVideoUrl: dto.exampleVideoUrl ?? null,
    });

    return this.templatesRepository.save(template);
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto): Promise<PromptTemplate> {
    const template = await this.templatesRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    Object.assign(template, dto);
    return this.templatesRepository.save(template);
  }

  async deleteTemplate(id: string): Promise<void> {
    const template = await this.templatesRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    template.isActive = false;
    await this.templatesRepository.save(template);
  }

  async seedDefaultTemplates(): Promise<void> {
    // Get names of already-seeded templates so we can insert only new ones
    const existing = await this.templatesRepository.find({ select: ['name'] });
    const existingNames = new Set(existing.map((t) => t.name));

    const defaults: Array<Partial<PromptTemplate>> = [
      // ─────────────────────────────────────────────────────────────
      // ORIGINAL GENERIC TEMPLATES (kept for backwards compatibility)
      // ─────────────────────────────────────────────────────────────
      {
        name: 'Professional Product Showcase',
        description: 'Clean, professional product showcase video.',
        promptText:
          'Create a professional 15-second product showcase video for {{PRODUCT_TITLE}}. The product is: {{PRODUCT_DESCRIPTION}}. Use smooth camera movements, clean white background, and elegant transitions. Highlight the product from multiple angles with soft lighting.',
        category: PromptCategory.PRODUCT_SHOWCASE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 1,
      },
      {
        name: 'Lifestyle in Action',
        description: 'Lifestyle scene showing real-world product use.',
        promptText:
          'Create a lifestyle video showing {{PRODUCT_TITLE}} being used in a real-world setting. Product details: {{PRODUCT_DESCRIPTION}}. Show the product in a cozy, well-lit environment with natural movements. Make it feel authentic and relatable.',
        category: PromptCategory.LIFESTYLE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 2,
      },
      {
        name: 'Dynamic Unboxing Experience',
        description: 'High-energy unboxing format with visual flair.',
        promptText:
          'Create an exciting unboxing video for {{PRODUCT_TITLE}}. Product: {{PRODUCT_DESCRIPTION}}. Start with a beautifully wrapped package, build anticipation with close-ups, then reveal the product with dramatic lighting and celebration effects. Add subtle particle effects.',
        category: PromptCategory.UNBOXING,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 3,
      },
      {
        name: 'Step-by-Step Tutorial',
        description: 'Instructional walkthrough with clear guidance.',
        promptText:
          'Create an instructional tutorial video for {{PRODUCT_TITLE}}. Product: {{PRODUCT_DESCRIPTION}}. Show step-by-step usage with clear visual indicators, text overlays for each step, and smooth transitions between steps. Keep it informative and visually engaging.',
        category: PromptCategory.TUTORIAL,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 4,
      },
      {
        name: 'Before & After Transformation',
        description: 'Dramatic comparison format for impact.',
        promptText:
          "Create a dramatic before-and-after comparison video featuring {{PRODUCT_TITLE}}. Product: {{PRODUCT_DESCRIPTION}}. Show the 'before' state, then a satisfying transition/transformation reveal to the 'after' state with the product. Use split-screen or wipe transitions.",
        category: PromptCategory.COMPARISON,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 5,
      },
      {
        name: 'Customer Testimonial Style',
        description: 'Trust-building testimonial-inspired format.',
        promptText:
          'Create a testimonial-style video for {{PRODUCT_TITLE}}. Product: {{PRODUCT_DESCRIPTION}}. Design it as if a happy customer is sharing their experience - show the product in daily use, add warm color grading, include subtle text overlays with key benefits, and end with a strong call-to-action moment.',
        category: PromptCategory.TESTIMONIAL,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 6,
      },

      // ─────────────────────────────────────────────────────────────
      // FASHION — DRESS / GARMENTS
      // ─────────────────────────────────────────────────────────────
      {
        name: 'Fashion Dress – Studio Elegance',
        description: 'Editorial studio showcase highlighting garment silhouette, drape, and fabric texture.',
        promptText:
          'Create a 15-second studio showcase video for {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. Open on a clean, softly lit studio background — ivory or light gray. The garment hangs on an invisible form or is worn by an unseen model. Camera slowly orbits the dress, highlighting fabric drape, silhouette shape, and fine stitching details. Close-up insert shots on hem, waistline, and neckline. Soft directional lighting from the upper-left creates gentle shadows that define the texture. Color palette is neutral and editorial. End on a full-length beauty shot.',
        category: PromptCategory.PRODUCT_SHOWCASE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 10,
      },
      {
        name: 'Fashion – Lifestyle Wear',
        description: 'Natural lifestyle video of a garment worn in a real urban or outdoor setting.',
        promptText:
          'Create a lifestyle video for {{PRODUCT_TITLE}} worn in a real-world setting. {{PRODUCT_DESCRIPTION}}. A person walks through a sunlit urban street or café environment, naturally wearing the garment. Camera follows at eye level with gentle handheld motion. Capture fabric movement as the wearer walks, turns, and interacts with surroundings. Warm golden-hour lighting. Candid, stylish, and aspirational — like a high-fashion editorial brought to life. No stiff posing. End with a slow push-in on a key outfit detail.',
        category: PromptCategory.LIFESTYLE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 11,
      },
      {
        name: 'Fashion – Premium Unboxing Reveal',
        description: 'Luxury unboxing theater: branded box, tissue paper, slow reveal.',
        promptText:
          'Create a premium unboxing video for {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. Start with a beautifully branded box resting on a styled surface — neutral linen, marble, or matte black. Hands enter frame with clean, manicured nails. The lid is lifted slowly. Tissue paper is peeled back in near slow-motion to reveal the garment or accessory beneath. Camera cuts to a beauty shot of the product laid perfectly flat. Final shot: the product presented on its surface under dramatic side lighting. No clutter, no rushing — pure luxury unboxing theater.',
        category: PromptCategory.UNBOXING,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 12,
      },

      // ─────────────────────────────────────────────────────────────
      // FASHION — SHOES / SNEAKERS
      // ─────────────────────────────────────────────────────────────
      {
        name: 'Fashion Shoes – Side Profile Showcase',
        description: 'Low-angle rotating showcase of footwear emphasizing sole, upper, and material details.',
        promptText:
          'Create a crisp product showcase video for {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. The shoe rotates on a reflective surface — matte black or marble. Camera starts at a low angle capturing the full side profile, sole edge, toe shape, and heel structure. Slow 360-degree rotation with a pause at the key 3/4 angle. Insert close-up shots of toe box texture, lace or strap detail, and branded logo. Lighting: key light highlighting the upper material, fill light for balance, no harsh shadows. Premium, minimalist, commercial-ready.',
        category: PromptCategory.PRODUCT_SHOWCASE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 13,
      },

      // ─────────────────────────────────────────────────────────────
      // FASHION — HANDBAG / ACCESSORIES
      // ─────────────────────────────────────────────────────────────
      {
        name: 'Fashion Handbag – Luxury Texture Close-Up',
        description: 'Cinematic luxury close-up showcasing leather texture, hardware, and bag silhouette.',
        promptText:
          'Create a luxury product showcase video for {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. Open with an extreme close-up of the bag exterior material — pebbled leather, smooth calf, or quilted fabric — to establish premium feel. Camera slowly pulls back to reveal the full bag shape. Show the hardware clasp catching light. Demonstrate the strap draping naturally. Open and close the bag in a smooth, deliberate motion. Lighting is cinematic: warm tungsten key light, cold fill, black card negative fill for contrast. Surface is dark velvet or aged wood. Mood is luxury editorial.',
        category: PromptCategory.PRODUCT_SHOWCASE,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 14,
      },

      // ─────────────────────────────────────────────────────────────
      // FASHION — JEWELRY
      // ─────────────────────────────────────────────────────────────
      {
        name: 'Fashion Jewelry – Sparkle & Reflection Reveal',
        description: 'Macro luxury close-up with light scattering across gemstones and metal surfaces.',
        promptText:
          'Create a luxury close-up video for {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. Begin in near darkness, then a soft light blooms to reveal the jewelry resting on black velvet or smooth skin. Extremely shallow depth of field. Camera performs a slow macro glide across the piece — gemstones catching and scattering light, metal surface reflecting the studio. Tiny specular highlights pulse and shimmer as the camera moves. Insert shots of clasp, setting, and stone facets. The video feels like watching light play with the piece. Rich, close, sensory, and high-end.',
        category: PromptCategory.PRODUCT_SHOWCASE,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 15,
      },

      // ─────────────────────────────────────────────────────────────
      // ELECTRONICS — GENERAL
      // ─────────────────────────────────────────────────────────────
      {
        name: 'Electronics – Studio Product Reveal',
        description: 'Clean commercial orbit of an electronic device highlighting industrial design and finish.',
        promptText:
          'Create a clean product showcase video for {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. The device sits on a minimal surface — matte white, dark concrete, or frosted glass. Camera performs a slow orbit from front to back, pausing on key design details: ports, buttons, LED indicators, venting, and logo. Insert close-up shots of the most premium-feeling details: brushed aluminum edges, precision cutouts, and textured grips. If it has a screen, it lights up mid-orbit to show a clean UI moment. Lighting: dual softboxes, no lens flare, subtle product reflection. Commercial, clean, trust-building.',
        category: PromptCategory.PRODUCT_SHOWCASE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 20,
      },
      {
        name: 'Electronics – Desk Setup Lifestyle',
        description: 'Aspirational home office or creative workspace lifestyle shot with the device in natural use.',
        promptText:
          'Create a lifestyle video showing {{PRODUCT_TITLE}} in a premium home office or creative workspace. {{PRODUCT_DESCRIPTION}}. A person sits at a well-styled desk — plants, warm lamp, minimal clutter. They interact with the product naturally: plugging in headphones, opening a laptop, adjusting a speaker. Camera captures medium and close shots of product in active use. Warm ambient lighting mixed with natural window light. The scene feels productive, aspirational, and attainable. Show the product solving a real problem effortlessly.',
        category: PromptCategory.LIFESTYLE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 21,
      },
      {
        name: 'Electronics – Feature Tutorial Demo',
        description: 'Informative 3-feature product demo with text overlay labels and close-up interaction shots.',
        promptText:
          'Create a tutorial-style product demo video for {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. Start with the product on a clean surface. Demonstrate 3 key features in sequence: each gets a close-up shot, a UI interaction, or a physical demonstration. Use clean animated text overlays to label each feature as it is shown. Camera alternates between overhead flat-lay shots and angled beauty shots. Pacing is informative but dynamic — not slow. End with the product fully in action, communicating capability and confidence. Ideal for product page or YouTube Shorts.',
        category: PromptCategory.TUTORIAL,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 22,
      },
      {
        name: 'Electronics – Premium Unboxing',
        description: 'Controlled, satisfying unboxing of a tech device with component reveal sequence.',
        promptText:
          'Create a high-quality unboxing video for {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. Open with the product box on a clean desk — lid centered in frame. Hands lift the lid slowly. Interior foam or insert is revealed: perfectly molded packaging. Components are lifted out one by one in deliberate sequence — cable, manual, accessories, then the main device. Each piece is placed with satisfying spacing. The main device is placed last, oriented toward camera, and lit with dramatic side lighting. No clutter, no rushing — premium, controlled, satisfying.',
        category: PromptCategory.UNBOXING,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 23,
      },
      {
        name: 'Electronics – Side-by-Side Feature Comparison',
        description: 'Split-screen or alternating-cuts comparison demonstrating why this device wins.',
        promptText:
          'Create a comparison-style product video featuring {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. Use split-screen or alternating cuts to demonstrate before/after or old-vs-new scenarios. Left side shows the problem state or inferior option; right side shows {{PRODUCT_TITLE}} solving or outperforming. Key comparison points are visualized with close-up inserts: sound quality via waveform, display clarity, build material, or battery indicator. Each comparison point lands with a clear visual beat. Tone is confident and authoritative — this product wins.',
        category: PromptCategory.COMPARISON,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 24,
      },

      // ─────────────────────────────────────────────────────────────
      // PHONES / SMARTPHONES
      // ─────────────────────────────────────────────────────────────
      {
        name: 'Smartphone – Launch Ad Showcase',
        description: 'Premium launch-ad style: floating phone, rim lighting, glass reflections, screen reveal.',
        promptText:
          'Create a premium product showcase video for {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. The phone appears against a gradient dark background — deep navy, space black, or midnight blue. Camera slowly rotates 360 degrees around the device, catching reflections on the glass and metal frame. Insert shots highlight the camera module array, slim profile silhouette, curved edges, and power button texture. The screen lights up mid-rotation to display a clean, colorful wallpaper. Lighting: dramatic rim lights and a moving specular highlight traveling across the glass surface. Final frame: full frontal beauty shot, screen glowing. Premium, minimal, powerful.',
        category: PromptCategory.PRODUCT_SHOWCASE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 30,
      },
      {
        name: 'Smartphone – Lifestyle Moments',
        description: 'Three quick urban lifestyle scenes showing the phone as a seamless daily companion.',
        promptText:
          'Create a lifestyle video showing {{PRODUCT_TITLE}} in everyday premium use. {{PRODUCT_DESCRIPTION}}. A person in a stylish urban setting uses the phone naturally across three quick scenes: photographing food at a café, taking a call while walking, and scrolling on a sofa in the evening. Camera captures close shots of hands on the phone, screen reflections in glasses, and the device in pocket or bag. Color grade is warm and cinematic. The phone feels like an extension of the user\'s life — elegant, fast, always beautiful.',
        category: PromptCategory.LIFESTYLE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 31,
      },
      {
        name: 'Smartphone – Camera Feature Tutorial',
        description: 'Three camera scenarios — portrait mode, night mode, slow-motion — each shown on-screen in real time.',
        promptText:
          'Create a tutorial demo video showcasing the camera capabilities of {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. Start with a close-up of the rear camera module. Then demonstrate three shooting scenarios in sequence: portrait mode with background blur, low-light night photography revealing detail from darkness, and slow-motion capture of a water splash. Each scenario cuts to what the phone screen shows in real time — the result looks stunning. Text overlays name each feature as it is demonstrated. Fast-paced but clear. End with a gallery of the resulting shots displayed on screen.',
        category: PromptCategory.TUTORIAL,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 32,
      },
      {
        name: 'Smartphone – Cinematic Unboxing',
        description: 'Movie-trailer quality unboxing with slow-motion lid reveal and screen first-boot moment.',
        promptText:
          'Create a cinematic unboxing video for {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. The box sits on a reflective surface, dramatically lit with a single side key light. The slide-open or lift-top motion is captured in slow motion. Inside: the phone rests face-up in a precision-molded tray. Hands lift the phone with care, turning it over to show both sides. The power button is pressed — screen awakens with the setup screen glowing. Camera performs a final slow push-in on the screen. Film grain overlay, cinematic 2.39:1 aspect ratio bars optional. Feels like a movie trailer for the phone.',
        category: PromptCategory.UNBOXING,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 33,
      },

      // ─────────────────────────────────────────────────────────────
      // BEAUTY — SKINCARE / COSMETICS / PERFUME
      // ─────────────────────────────────────────────────────────────
      {
        name: 'Beauty – Luxury Product Close-Up',
        description: 'Clean, aspirational beauty product showcase with drop/texture insert shots.',
        promptText:
          'Create a beauty product showcase video for {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. The product sits on a clean minimal surface — white marble, frosted glass, or pale rose linen. Camera starts at product level and slowly pulls back. Insert close-up shots of the label, cap, formula texture visible through packaging, and any metallic or reflective elements. If it is a liquid product, show a drop of formula hitting a surface in slow motion. Soft diffused lighting, gentle bokeh background. The aesthetic is clean, hygienic, premium, and aspirational. Suitable for skincare, serum, perfume, or cosmetics.',
        category: PromptCategory.PRODUCT_SHOWCASE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 40,
      },
      {
        name: 'Beauty – Skincare Ritual Lifestyle',
        description: 'Slow, meditative lifestyle video of a beauty ritual with sensory close-up application.',
        promptText:
          'Create a lifestyle video showing {{PRODUCT_TITLE}} being used as part of a beauty ritual. {{PRODUCT_DESCRIPTION}}. A person in a clean, well-lit bathroom or vanity area applies the product. Camera captures the ritual in close detail: hands picking up the product, dispensing a small amount, applying it to skin with gentle motion. Skin texture is clear, smooth, and well-lit with soft ring light or window light. Pacing is slow and meditative. Natural, clean beauty aesthetic. End with the person looking at their skin in the mirror, satisfied. Color grade is warm-neutral with high skin detail.',
        category: PromptCategory.LIFESTYLE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 41,
      },
      {
        name: 'Beauty – Step-by-Step Application Tutorial',
        description: 'Educational beauty tutorial showing dispensing, formula texture, and application technique.',
        promptText:
          'Create a tutorial-style video demonstrating how to use {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. Begin with the product on a clean surface. Step 1: show the dispensing or pump action in close-up. Step 2: show the formula texture — its viscosity, color, and finish. Step 3: demonstrate application technique on skin in a clear instructional close-up. Each step is labeled with clean text overlays. Show the before skin state and the after-application glow. Camera is steady and clinically beautiful — like a premium YouTube tutorial. End with the product placed beside the visible result.',
        category: PromptCategory.TUTORIAL,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 42,
      },
      {
        name: 'Beauty – Before/After Skin Transformation',
        description: 'Credible split-screen skin transformation with warm/cool lighting contrast.',
        promptText:
          'Create a dramatic before-and-after transformation video for {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. The video opens on a "before" state: skin texture or concern area shown in soft close-up. A smooth split-screen wipe or swipe transition reveals the "after" state — visibly improved, glowing, transformed skin on the same area. The transformation is realistic and believable, not extreme. Warm, flattering lighting on the after side versus slightly cooler, flatter lighting on the before. End with a full-face or product beauty shot. Persuasive, credible, beautifully shot.',
        category: PromptCategory.COMPARISON,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 43,
      },

      // ─────────────────────────────────────────────────────────────
      // HOME & FURNITURE
      // ─────────────────────────────────────────────────────────────
      {
        name: 'Home – Interior Placement Showcase',
        description: 'Room-scale product reveal that establishes scale, material, and interior harmony.',
        promptText:
          'Create a product showcase video for {{PRODUCT_TITLE}} placed in a beautifully styled interior setting. {{PRODUCT_DESCRIPTION}}. The product is introduced in a well-designed room — natural light from a side window, neutral furniture, and minimal decor. Camera opens on the product from across the room, then slowly dollies in to a medium shot, then inserts close-ups of surface finish, texture, material quality, and functional details. Reveal the product\'s scale relative to the space. Warm, natural light with gentle shadows. The setting feels like a premium interior design shoot — aspirational but achievable. End on the product\'s best angle.',
        category: PromptCategory.PRODUCT_SHOWCASE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 50,
      },
      {
        name: 'Home – Lifestyle Living Scene',
        description: 'Person naturally using or enjoying a home product in an aspirational lived-in environment.',
        promptText:
          'Create a lifestyle video featuring {{PRODUCT_TITLE}} in a lived-in, aspirational home environment. {{PRODUCT_DESCRIPTION}}. A person interacts with the product naturally in their living space — sitting on a sofa, using a lamp, placing a decorative item, or operating a kitchen appliance. The interaction feels effortless and real. Camera captures wide establishing shots of the styled room, medium shots of the person and product, then close insert shots of the product in use. Natural window light and warm interior lamp light. The mood is comfortable, elevated, and desirable.',
        category: PromptCategory.LIFESTYLE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 51,
      },
      {
        name: 'Home – Assembly & Setup Tutorial',
        description: 'Step-by-step assembly video with overhead flat-lay component reveal and labeled steps.',
        promptText:
          'Create a clear tutorial video for {{PRODUCT_TITLE}} showing setup or assembly. {{PRODUCT_DESCRIPTION}}. Begin with all components laid out on a clean surface in an overhead flat-lay shot. Walk through the assembly process in clear sequence: each step is captured in a close-up or medium shot. Text overlays label each action — "Step 1: attach base", "Step 2: tighten bolts" and so on. Camera uses top-down and angled shots alternately for clarity. The final assembled product is revealed in a satisfying beauty shot in its intended environment. Pacing is instructional, clear, and confidence-building.',
        category: PromptCategory.TUTORIAL,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 52,
      },

      // ─────────────────────────────────────────────────────────────
      // FITNESS & WELLNESS
      // ─────────────────────────────────────────────────────────────
      {
        name: 'Fitness – Performance Product Showcase',
        description: 'Bold, high-contrast gym-environment showcase communicating strength and durability.',
        promptText:
          'Create a dynamic product showcase video for {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. The product is placed against a clean gym, studio, or athletic environment background. Camera opens on the product from a low, powerful angle — wide lens, slight worm\'s-eye view to communicate strength. Slow rotation with insert close-ups of material, grip texture, hardware, and weight or size indicators. Lighting is bold: high contrast, dramatic shadows, desaturated athletic color grade. If it is equipment, show it briefly in action — weights lifted, bands stretched, mat unrolled. Communicates performance, durability, and quality.',
        category: PromptCategory.PRODUCT_SHOWCASE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 60,
      },
      {
        name: 'Fitness – Workout Lifestyle',
        description: 'Energetic beat-synced lifestyle video of a person training with the fitness product.',
        promptText:
          'Create a lifestyle video showing {{PRODUCT_TITLE}} being used during an athletic or wellness session. {{PRODUCT_DESCRIPTION}}. A fit, motivated person uses the product in a gym, home workout space, or outdoor setting. Camera captures the product in active use: dumbbells lifted, mat in downward dog, shaker being mixed, bands stretched. Quick cuts between action moments at an energetic pace. Natural gym lighting mixed with dramatic overhead spots. Color grade: punchy, high contrast, slightly desaturated. Editing rhythm implies music sync. Communicates energy, motivation, and athletic identity.',
        category: PromptCategory.LIFESTYLE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 61,
      },
      {
        name: 'Fitness – Exercise Tutorial',
        description: 'Two-angle instructional demo showing correct setup, proper form, and a common mistake correction.',
        promptText:
          'Create a fitness tutorial video demonstrating how to use {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. Start with the product on a clean gym floor or mat. Step 1: demonstrate the setup or assembly. Step 2: show correct usage technique from two angles — side and front. Step 3: show a quick common mistake versus correct form comparison. Text overlays label each step clearly. Camera alternates between close-ups of grip, form, and equipment interaction. Tone is instructional, helpful, and motivating. End with the person completing a rep and placing the product down with satisfaction.',
        category: PromptCategory.TUTORIAL,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 62,
      },

      // ─────────────────────────────────────────────────────────────
      // AUTOMOTIVE ACCESSORIES
      // ─────────────────────────────────────────────────────────────
      {
        name: 'Auto Accessory – Product Showcase',
        description: 'Sleek automotive-context product showcase transitioning from isolation to in-car placement.',
        promptText:
          'Create a product showcase video for {{PRODUCT_TITLE}} in an automotive context. {{PRODUCT_DESCRIPTION}}. The accessory is displayed on a clean surface, then placed in its intended car environment — dashboard, seat, windshield, or center console. Camera opens on the product in isolation, captures key design details in close-up: material finish, mounting mechanism, functional controls, and brand markings. Then shows it in-car from the driver\'s perspective. Sleek, modern, automotive-quality lighting. Color grade is cool and technical. Communicates precision engineering and ease of use.',
        category: PromptCategory.PRODUCT_SHOWCASE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 70,
      },
      {
        name: 'Auto – In-Car Lifestyle',
        description: 'Driver-perspective lifestyle video showing the accessory working effortlessly on the road.',
        promptText:
          'Create a lifestyle video showing {{PRODUCT_TITLE}} being used while driving or preparing to drive. {{PRODUCT_DESCRIPTION}}. A driver prepares their car: attaches or activates the accessory, then drives in an urban or scenic road environment. Camera captures through-windshield shots, close-ups of the product in use on the dashboard, and driver interaction moments. The product works effortlessly — no fumbling. Shot in golden morning light or urban night lighting. Mood is independent, capable, and modern. Suitable for TikTok, Instagram Reels, or product page.',
        category: PromptCategory.LIFESTYLE,
        tier: PromptTier.BASIC,
        isActive: true,
        sortOrder: 71,
      },
      {
        name: 'Auto – Installation Tutorial',
        description: 'Step-by-step in-car installation video with numbered steps and driver-seat perspective.',
        promptText:
          'Create a step-by-step installation tutorial for {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. Start with the product in its packaging placed on a car seat or dash surface. Show required tools in a quick flat-lay if applicable. Walk through installation in numbered steps: find mounting location, prepare surface, attach mechanism, secure product, test operation. Each step is captured in close-up from the driver-seat perspective. Text overlays label each step cleanly. Final shot: the product installed and functioning correctly. Tone is practical, clear, and confidence-building. Great for YouTube Shorts or product page FAQ.',
        category: PromptCategory.TUTORIAL,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 72,
      },

      // ─────────────────────────────────────────────────────────────
      // PREMIUM CREATIVE VARIANTS
      // ─────────────────────────────────────────────────────────────
      {
        name: 'Premium – Cinematic Hero Ad',
        description: 'Brand-level cinematic ad: sweeping environment, fluid tracking shots, product as art.',
        promptText:
          'Create a cinematic hero advertisement video for {{PRODUCT_TITLE}}. {{PRODUCT_DESCRIPTION}}. This is a brand-level ad, not a product demo. Open with a sweeping wide establishing shot of a premium environment — city skyline, elegant interior, or natural landscape. Cut to the product appearing in frame, held or used by an unseen person. Camera movement is fluid and intentional — tracking shots, slow push-ins, beauty close-ups. The product is lit like art: rich shadows, single dramatic key light, perfect reflections. End on a product close-up with everything else blurred into bokeh. No talking, no text — pure visual storytelling. Feel: luxury automotive commercial meets fashion brand film.',
        category: PromptCategory.TESTIMONIAL,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 80,
      },
      {
        name: 'Premium – Social Media Reel',
        description: 'Vertical 9:16 thumb-stopping reel with strong 2-second hook and 4–5 fast lifestyle cuts.',
        promptText:
          'Create a fast-paced social media reel for {{PRODUCT_TITLE}} optimized for vertical 9:16 format. {{PRODUCT_DESCRIPTION}}. Open with a strong product hook in the first 2 seconds — close-up, color pop, or dynamic movement. Then cut through 4-5 fast lifestyle moments showing the product in use: different settings, angles, and times of day. Each cut is tight and dynamic. Color grade is vibrant and platform-native — high saturation, punchy blacks. End with a strong product beauty shot with implied call-to-action framing (space for text overlay). Designed for TikTok, Instagram Reels, and YouTube Shorts — thumb-stopping, shareable, and visually feed-native.',
        category: PromptCategory.LIFESTYLE,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 81,
      },
      {
        name: 'Premium – E-Commerce Product Ad',
        description: 'Paid-ad ready video: clean isolation + lifestyle transition, accurate color, flexible aspect ratio.',
        promptText:
          'Create an e-commerce advertisement video for {{PRODUCT_TITLE}} designed for product listing pages and paid ads. {{PRODUCT_DESCRIPTION}}. The video opens with the product in clean isolation — white or gradient background. Camera captures multiple hero angles in 3 seconds: front, side, top-down, and 3/4 detail shot. Then transitions to a lifestyle moment showing the product in use. Ends with the product back on its clean background with implied space for text overlays (price, features, or ratings). Lighting is bright, clean, and accurate to the product\'s true color. Shoot for both 1:1 and 16:9 framing. Designed for Amazon, Shopify, or Facebook Ad placements.',
        category: PromptCategory.PRODUCT_SHOWCASE,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 82,
      },
      {
        name: 'Premium – Brand Testimonial Story',
        description: 'Handheld documentary-style lifestyle capture communicating authentic customer delight.',
        promptText:
          'Create a testimonial-style video showcasing {{PRODUCT_TITLE}} from a satisfied customer perspective. {{PRODUCT_DESCRIPTION}}. Style the video as a genuine lifestyle capture: a person in a real, lived-in environment using and experiencing the product. Camera mimics handheld documentary style — slightly loose, reactive, authentic. The person\'s expressions and body language communicate genuine satisfaction: a smile, a nod of approval, a moment of clear delight. The product is central but not forced. Warm, inviting color grade. End with a quiet beauty shot of the product resting naturally in the scene. The overall message: this product made their life better, effortlessly.',
        category: PromptCategory.TESTIMONIAL,
        tier: PromptTier.PREMIUM,
        isActive: true,
        sortOrder: 83,
      },
    ];

    const toInsert = defaults.filter((t) => !existingNames.has(t.name as string));

    if (toInsert.length === 0) {
      return;
    }

    await this.templatesRepository.save(
      toInsert.map((template) => this.templatesRepository.create(template)),
    );
  }

  private async canAccessPremiumTemplates(userId?: string): Promise<boolean> {
    if (!userId) {
      return false;
    }

    const subscription = await this.subscriptionsRepository.findOne({
      where: { userId },
      relations: ['tier'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription || !subscription.tier) {
      return false;
    }

    return subscription.tier.name !== 'free';
  }
}
