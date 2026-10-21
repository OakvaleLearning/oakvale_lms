// The programmes as sold on the marketing site (learners_portal
// src/content/site.ts): titles, descriptions, tier prices (Naira) and the
// course outline. `npm run seed` loads this into the LMS.
//
// Each programme has two courses (Foundation → Professional). Tiers unlock:
// foundation → Foundation, professional → Professional, full → both.

export const PROGRAMS = [
  {
    slug: "adult-care",
    title: "Adult & Elderly Care",
    description:
      "Turn empathy into a recognised profession. Learn how to deliver safe, dignified, and clinical care for aging adults and recovering patients.",
    courses: {
      foundation: {
        title: "The Foundation",
        description:
          "We start with the absolute basics. You will learn the core principles of duty of care, ethical communication, and how to protect a patient's dignity. This is where you build your confidence and learn what it actually means to be a professional caregiver.",
        modules: ["Fundamental Principles & Standards", "Best Practices in Care Delivery"],
      },
      professional: {
        title: "Professional Mastery",
        description:
          "Once you have the basics, we move to clinical realities. You will master infection prevention, complex daily routines, safe lifting, and the exact standards required by premium clinics, private clients, and top-tier care agencies. Finally, we train you on how to turn these skills into a profitable career.",
        modules: ["Core Skills & Competencies", "Employability & Micro-Entrepreneurship in Care"],
      },
    },
    tiers: {
      foundation: {
        name: "Foundation",
        price: 35000,
        description:
          "Step confidently into the care sector. Master the essential skills to expertly care for loved ones or secure your first professional role.",
      },
      professional: {
        name: "Professional",
        price: 70000,
        description:
          "You have the basics. Now elevate your expertise. Master advanced practical skills, increase your earning potential, and step into senior roles or entrepreneurship. Prerequisite: Foundation.",
      },
      full: {
        name: "Full Programme",
        price: 100000,
        description:
          "No interruptions. No upgrade friction. Get instant access to the entire pathway from absolute beginner to a fully equipped care professional.",
      },
    },
  },
  {
    slug: "child-care",
    title: "Childcare & Early Years",
    description:
      "From birth to five years. Master the developmental milestones and safety standards required to secure premium nursery roles, work for families, care for your own kids, or build your own childcare service.",
    courses: {
      foundation: {
        title: "Infant & Toddler Foundation (0–2 Years)",
        description:
          "Become the kind of childcare professional families trust. We start with role boundaries and global frameworks, then move deeply into the brain growth, developmental milestones, and daily routines for infants and toddlers.",
        modules: [
          "Professional Identity, Values & Responsibilities",
          "Foundations of Early Childhood Development (0 to 2 Years)",
        ],
      },
      professional: {
        title: "Preschool Mastery (3–5 Years)",
        description:
          "Once you have the basics, we build confidence in supporting preschoolers. You will master school readiness, spotting developmental red flags, fire and food safety, strict safeguarding protocols, and how to structure your own childcare business.",
        modules: ["Development, Safety & Child Protection (3 to 5 Years)", "Career Pathways & Professional Growth"],
      },
    },
    tiers: {
      foundation: {
        name: "Foundation",
        price: 30000,
        description:
          "Build a rock-solid foundation in infant and toddler care. Perfect for starting your career journey or mastering the basics for your own family.",
      },
      professional: {
        name: "Professional",
        price: 55000,
        description:
          "You have the basics. Now unlock advanced opportunities. Master the complete birth-to-five spectrum and position yourself for premium childcare roles. Prerequisite: Foundation.",
      },
      full: {
        name: "Full Programme",
        price: 80000,
        description:
          "The complete birth-to-five mastery pathway. Go from beginner to a fully equipped, confident early years professional without any upgrade friction.",
      },
    },
  },
];
