import { db } from "./db";
import { 
  tenants, users, opportunities, bidProjects, approvalRequests, 
  teamingPartners, knowledgeDocuments, captureStages 
} from "@shared/schema";

export async function seedDatabase() {
  console.log("Seeding database with HERBIE Command Dashboard data...");

  const tenantId = "blackhawk-default";

  // Ensure tenant exists
  await db.insert(tenants).values({
    id: tenantId,
    legalName: "BlackHawk Construction",
    dbaName: "BlackHawk",
  }).onConflictDoNothing();

  // Seed capture stages
  const captureStageData = [
    { id: "stage-1", tenantId, name: "Prospect", stageOrder: 1, color: "#6366f1" },
    { id: "stage-2", tenantId, name: "Qualified", stageOrder: 2, color: "#8b5cf6" },
    { id: "stage-3", tenantId, name: "Capture", stageOrder: 3, color: "#a855f7" },
    { id: "stage-4", tenantId, name: "Proposal", stageOrder: 4, color: "#ec4899" },
    { id: "stage-5", tenantId, name: "Submitted", stageOrder: 5, color: "#f97316" },
    { id: "stage-6", tenantId, name: "Won/Lost", stageOrder: 6, color: "#22c55e" },
  ];

  for (const stage of captureStageData) {
    await db.insert(captureStages).values(stage).onConflictDoNothing();
  }

  // Seed opportunities
  const opportunityData = [
    {
      id: "opp-001",
      tenantId,
      solicitationNumber: "W912DY-25-R-0001",
      title: "Fort Bragg Barracks Renovation Phase III",
      agency: "U.S. Army Corps of Engineers",
      description: "Complete renovation of Building 42-A including HVAC modernization, electrical upgrades, ADA compliance modifications, and interior finish work. Project includes demolition of existing systems and installation of energy-efficient replacements.",
      naicsCodes: ["236220", "238210"],
      setAside: "SDVOSB",
      postedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      dueAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
      estimatedValue: "4500000",
      placeOfPerformance: "Fort Bragg, NC",
      sourceUrl: "https://sam.gov/opp/example1",
      status: "active",
    },
    {
      id: "opp-002",
      tenantId,
      solicitationNumber: "FA4890-25-R-0042",
      title: "Tinker AFB Runway Pavement Repair",
      agency: "U.S. Air Force",
      description: "Repair and resurfacing of Runway 13/31 including milling, patching, and application of new asphalt overlay. Work must be performed during night operations to minimize airfield disruption.",
      naicsCodes: ["237310", "238990"],
      setAside: "8(a)",
      postedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      estimatedValue: "2800000",
      placeOfPerformance: "Tinker AFB, OK",
      sourceUrl: "https://sam.gov/opp/example2",
      status: "active",
    },
    {
      id: "opp-003",
      tenantId,
      solicitationNumber: "N00189-25-R-0088",
      title: "Naval Station Norfolk Pier Rehabilitation",
      agency: "Naval Facilities Engineering Command",
      description: "Structural rehabilitation of Pier 7 including concrete repair, cathodic protection system installation, fender system replacement, and utility infrastructure upgrades.",
      naicsCodes: ["237990", "238120"],
      setAside: "HUBZone",
      postedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      estimatedValue: "8200000",
      placeOfPerformance: "Norfolk, VA",
      sourceUrl: "https://sam.gov/opp/example3",
      status: "active",
    },
    {
      id: "opp-004",
      tenantId,
      solicitationNumber: "GS-07F-5889R",
      title: "GSA Building Modernization - Denver Federal Center",
      agency: "General Services Administration",
      description: "Complete interior modernization of Building 25 including open office redesign, technology infrastructure upgrades, LED lighting conversion, and HVAC system optimization.",
      naicsCodes: ["236220", "238210", "238220"],
      setAside: "Small Business",
      postedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      estimatedValue: "6100000",
      placeOfPerformance: "Denver, CO",
      sourceUrl: "https://sam.gov/opp/example4",
      status: "active",
    },
    {
      id: "opp-005",
      tenantId,
      solicitationNumber: "VA257-25-R-0015",
      title: "VA Medical Center Emergency Department Expansion",
      agency: "Department of Veterans Affairs",
      description: "Design-build expansion of emergency department including 12 new treatment bays, trauma center upgrades, imaging suite addition, and associated MEP systems.",
      naicsCodes: ["236220", "621111"],
      setAside: "SDVOSB",
      postedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      dueAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      estimatedValue: "15000000",
      placeOfPerformance: "Tampa, FL",
      sourceUrl: "https://sam.gov/opp/example5",
      status: "active",
    },
    {
      id: "opp-006",
      tenantId,
      solicitationNumber: "DTFH61-25-R-0023",
      title: "I-95 Bridge Deck Replacement",
      agency: "Federal Highway Administration",
      description: "Complete replacement of bridge deck on I-95 overpass including demolition, reinforcement installation, concrete placement, and traffic management during construction.",
      naicsCodes: ["237310", "237110"],
      setAside: "Unrestricted",
      postedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      dueAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      estimatedValue: "12500000",
      placeOfPerformance: "Baltimore, MD",
      sourceUrl: "https://sam.gov/opp/example6",
      status: "active",
    },
    {
      id: "opp-007",
      tenantId,
      solicitationNumber: "W91238-25-R-0007",
      title: "Camp Lejeune Ammunition Storage Facility",
      agency: "U.S. Marine Corps",
      description: "Construction of new ammunition storage facility meeting DoD 6055.9-STD requirements including reinforced concrete construction, blast-resistant doors, environmental controls, and security systems.",
      naicsCodes: ["236210", "238290"],
      setAside: "SDVOSB",
      postedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      dueAt: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000),
      estimatedValue: "9800000",
      placeOfPerformance: "Camp Lejeune, NC",
      sourceUrl: "https://sam.gov/opp/example7",
      status: "active",
    },
    {
      id: "opp-008",
      tenantId,
      solicitationNumber: "EP-D4-25-002",
      title: "EPA Superfund Site Remediation - Phase 2",
      agency: "Environmental Protection Agency",
      description: "Continuation of site remediation activities including soil excavation, groundwater treatment system operation, cap installation, and long-term monitoring well installation.",
      naicsCodes: ["562910", "237990"],
      setAside: "8(a)",
      postedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
      dueAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
      estimatedValue: "7300000",
      placeOfPerformance: "Trenton, NJ",
      sourceUrl: "https://sam.gov/opp/example8",
      status: "active",
    },
    {
      id: "opp-009",
      tenantId,
      solicitationNumber: "DHS-CBP-25-R-0044",
      title: "Border Patrol Station Expansion",
      agency: "Customs and Border Protection",
      description: "Facility expansion including new processing area, detention facilities, vehicle maintenance bay, and perimeter security upgrades with anti-climb fencing.",
      naicsCodes: ["236220", "238210"],
      setAside: "Small Business",
      postedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      dueAt: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
      estimatedValue: "11200000",
      placeOfPerformance: "Laredo, TX",
      sourceUrl: "https://sam.gov/opp/example9",
      status: "active",
    },
    {
      id: "opp-010",
      tenantId,
      solicitationNumber: "NPS-25-R-0019",
      title: "Yellowstone Visitor Center Renovation",
      agency: "National Park Service",
      description: "Historic preservation and renovation of Old Faithful Visitor Center including structural repairs, exhibit space modernization, ADA accessibility improvements, and sustainable systems upgrades.",
      naicsCodes: ["236220", "238990"],
      setAside: "HUBZone",
      postedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      dueAt: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000),
      estimatedValue: "5600000",
      placeOfPerformance: "Yellowstone, WY",
      sourceUrl: "https://sam.gov/opp/example10",
      status: "active",
    },
    {
      id: "opp-011",
      tenantId,
      solicitationNumber: "DOE-25-R-0033",
      title: "National Laboratory Clean Room Facility",
      agency: "Department of Energy",
      description: "Construction of ISO Class 5 clean room facility for advanced manufacturing research including specialized HVAC, ESD flooring, and process utility distribution.",
      naicsCodes: ["236210", "238220"],
      setAside: "WOSB",
      postedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      dueAt: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000),
      estimatedValue: "18500000",
      placeOfPerformance: "Oak Ridge, TN",
      sourceUrl: "https://sam.gov/opp/example11",
      status: "active",
    },
    {
      id: "opp-012",
      tenantId,
      solicitationNumber: "USCG-25-R-0012",
      title: "Coast Guard Station Boat House Replacement",
      agency: "U.S. Coast Guard",
      description: "Demolition and replacement of boat house facility including marine railway, boat hoists, maintenance bay, and support facilities for 45-foot response boats.",
      naicsCodes: ["237990", "238990"],
      setAside: "SDVOSB",
      postedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      dueAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
      estimatedValue: "4200000",
      placeOfPerformance: "Seattle, WA",
      sourceUrl: "https://sam.gov/opp/example12",
      status: "active",
    },
  ];

  for (const opp of opportunityData) {
    await db.insert(opportunities).values(opp).onConflictDoNothing();
  }

  // Seed bid projects
  const bidProjectData = [
    {
      id: "bid-001",
      tenantId,
      opportunityId: "opp-001",
      status: "capture" as const,
      ownerId: 1,
      pwinScore: 72,
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
    {
      id: "bid-002",
      tenantId,
      opportunityId: "opp-003",
      status: "proposal" as const,
      ownerId: 1,
      pwinScore: 85,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    },
    {
      id: "bid-003",
      tenantId,
      opportunityId: "opp-005",
      status: "qualified" as const,
      ownerId: 1,
      pwinScore: 68,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      id: "bid-004",
      tenantId,
      opportunityId: "opp-007",
      status: "submitted" as const,
      ownerId: 1,
      pwinScore: 78,
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    },
    {
      id: "bid-005",
      tenantId,
      opportunityId: "opp-009",
      status: "prospect" as const,
      ownerId: 1,
      pwinScore: 55,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
    {
      id: "bid-006",
      tenantId,
      opportunityId: "opp-011",
      status: "capture" as const,
      ownerId: 1,
      pwinScore: 62,
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    },
  ];

  for (const bid of bidProjectData) {
    await db.insert(bidProjects).values(bid).onConflictDoNothing();
  }

  // Seed approval requests
  const approvalData = [
    {
      id: "apr-001",
      tenantId,
      entityType: "bid_decision",
      entityId: "bid-001",
      actionType: "bid",
      requestedBy: "herbie-agent",
      status: "pending",
      priority: "high",
      contextJson: { reason: "High-fit SDVOSB opportunity with strong NAICS alignment. Estimated value $4.5M within bonding capacity.", requiredRole: "project_director" },
    },
    {
      id: "apr-002",
      tenantId,
      entityType: "bid_decision",
      entityId: "bid-003",
      actionType: "bid",
      requestedBy: "herbie-agent",
      status: "pending",
      priority: "urgent",
      contextJson: { reason: "VA Medical Center expansion - $15M value requires CEO approval. Strong past performance in healthcare construction.", requiredRole: "ceo" },
    },
    {
      id: "apr-003",
      tenantId,
      entityType: "email",
      entityId: "email-draft-001",
      actionType: "send_email",
      requestedBy: "herbie-agent",
      status: "pending",
      priority: "normal",
      contextJson: { reason: "Outreach email to Army Corps contracting officer regarding Fort Bragg opportunity questions.", requiredRole: "contracts_manager" },
    },
    {
      id: "apr-004",
      tenantId,
      entityType: "teaming_agreement",
      entityId: "team-001",
      actionType: "initiate_teaming",
      requestedBy: "herbie-agent",
      status: "pending",
      priority: "high",
      contextJson: { reason: "Teaming agreement with Apex HVAC Solutions for Naval Station Norfolk pier project - they provide marine HVAC expertise.", requiredRole: "vp_operations" },
    },
    {
      id: "apr-005",
      tenantId,
      entityType: "bid_decision",
      entityId: "bid-005",
      actionType: "bid",
      requestedBy: "herbie-agent",
      status: "pending",
      priority: "normal",
      contextJson: { reason: "Border Patrol Station expansion - moderate Pwin (55%) but aligns with geographic expansion strategy.", requiredRole: "project_director" },
    },
    {
      id: "apr-006",
      tenantId,
      entityType: "bid_decision",
      entityId: "bid-002",
      actionType: "bid",
      requestedBy: "herbie-agent",
      status: "approved",
      priority: "high",
      contextJson: { reason: "Naval pier rehabilitation - strong marine construction experience and HUBZone set-aside advantage.", requiredRole: "ceo" },
    },
  ];

  for (const approval of approvalData) {
    await db.insert(approvalRequests).values(approval).onConflictDoNothing();
  }

  // Seed teaming partners
  const teamingPartnerData = [
    {
      id: "team-001",
      tenantId,
      companyName: "Apex HVAC Solutions",
      duns: "123456789",
      cage: "5ABC1",
      contactName: "James Mitchell",
      contactEmail: "jmitchell@apexhvac.com",
      naicsCodes: ["238220", "238210"],
      setAsideCertifications: ["SDVOSB", "Small Business"],
      capabilities: "Specialized in marine and industrial HVAC systems. 15+ years federal contracting experience with NAVFAC and USACE.",
      relationshipStatus: "preferred",
      rating: 5,
    },
    {
      id: "team-002",
      tenantId,
      companyName: "Precision Electrical Contractors",
      duns: "234567890",
      cage: "6DEF2",
      contactName: "Sarah Chen",
      contactEmail: "schen@precisionelec.com",
      naicsCodes: ["238210", "238990"],
      setAsideCertifications: ["WOSB", "8(a)"],
      capabilities: "Electrical infrastructure, renewable energy installations, and smart building systems. GSA Schedule holder.",
      relationshipStatus: "active",
      rating: 4,
    },
    {
      id: "team-003",
      tenantId,
      companyName: "Environmental Remediation Partners",
      duns: "345678901",
      cage: "7GHI3",
      contactName: "Robert Johnson",
      contactEmail: "rjohnson@envremediation.com",
      naicsCodes: ["562910", "237990"],
      setAsideCertifications: ["8(a)", "HUBZone"],
      capabilities: "CERCLA/RCRA remediation, environmental assessments, and brownfield redevelopment. Top Secret facility clearance.",
      relationshipStatus: "active",
      rating: 4,
    },
    {
      id: "team-004",
      tenantId,
      companyName: "Structural Innovations LLC",
      duns: "456789012",
      cage: "8JKL4",
      contactName: "Maria Garcia",
      contactEmail: "mgarcia@structuralinnovations.com",
      naicsCodes: ["237990", "238120"],
      setAsideCertifications: ["SDVOSB"],
      capabilities: "Bridge rehabilitation, concrete repair, and structural engineering support. Specializes in historic preservation.",
      relationshipStatus: "preferred",
      rating: 5,
    },
    {
      id: "team-005",
      tenantId,
      companyName: "SecureBuild Defense",
      duns: "567890123",
      cage: "9MNO5",
      contactName: "Thomas Anderson",
      contactEmail: "tanderson@securebuilddef.com",
      naicsCodes: ["236210", "238290"],
      setAsideCertifications: ["Small Business"],
      capabilities: "SCIF construction, anti-terrorism force protection, and secure facility construction. TS/SCI cleared personnel.",
      relationshipStatus: "prospective",
      rating: 3,
    },
  ];

  for (const partner of teamingPartnerData) {
    await db.insert(teamingPartners).values(partner).onConflictDoNothing();
  }

  // Seed knowledge documents
  const knowledgeDocData = [
    {
      id: "doc-001",
      tenantId,
      title: "BlackHawk Past Performance - Fort Bragg Projects",
      documentType: "past_performance",
      content: "BlackHawk Construction completed three major renovation projects at Fort Bragg between 2020-2024, totaling $12.5M in contract value. Projects included Building 18-C HVAC modernization ($3.2M, completed on schedule), Building 22-A electrical upgrade ($4.8M, 2 weeks early), and Building 35-B interior renovation ($4.5M, under budget by 8%). All projects received CPARS ratings of Exceptional or Very Good.",
      sourceSystem: "internal",
      status: "active",
    },
    {
      id: "doc-002",
      tenantId,
      title: "FAR 52.219-14 - Limitations on Subcontracting",
      documentType: "compliance",
      content: "Under SDVOSB set-aside contracts, at least 50% of the cost of contract performance incurred for personnel shall be expended for employees of the concern. For construction contracts, at least 15% must be performed by the prime contractor. Subcontracting to other small businesses counts toward the 50% requirement. Detailed records must be maintained to demonstrate compliance.",
      sourceSystem: "far_library",
      status: "active",
    },
    {
      id: "doc-003",
      tenantId,
      title: "Bonding Capacity Summary - Q4 2024",
      documentType: "financial",
      content: "Current bonding capacity: Single project limit $18M, aggregate limit $45M. Surety: Federal Insurance Company. Bonding utilization as of December 2024: 62% ($27.9M of $45M aggregate). Available capacity for new projects: $17.1M aggregate, $18M single. Recent bonding history: No claims in past 5 years, steady capacity increases since 2020.",
      sourceSystem: "internal",
      status: "active",
    },
    {
      id: "doc-004",
      tenantId,
      title: "BlackHawk NAICS Code Experience Matrix",
      documentType: "capabilities",
      content: "Primary NAICS codes with demonstrated experience: 236220 (Commercial and Institutional Building Construction) - 45 projects, $125M cumulative; 238210 (Electrical Contractors) - 28 projects, $42M cumulative; 237990 (Other Heavy and Civil Engineering) - 15 projects, $38M cumulative; 238220 (Plumbing, Heating, AC) - 22 projects, $31M cumulative. Secondary codes include 236210, 237310, and 562910.",
      sourceSystem: "internal",
      status: "active",
    },
    {
      id: "doc-005",
      tenantId,
      title: "Bid/No-Bid Decision Criteria",
      documentType: "procedure",
      content: "Opportunity evaluation criteria: 1) NAICS alignment (minimum 80% match required), 2) Geographic fit (preferred regions: NC, VA, FL, TX), 3) Contract value ($500K - $18M optimal), 4) Set-aside advantage (SDVOSB preferred), 5) Past performance relevance, 6) Timeline feasibility (minimum 30 days for proposal prep), 7) Competitive landscape assessment. Opportunities scoring below 60 require executive review for bid decision.",
      sourceSystem: "internal",
      status: "active",
    },
  ];

  for (const doc of knowledgeDocData) {
    await db.insert(knowledgeDocuments).values(doc).onConflictDoNothing();
  }

  console.log("Database seeded successfully with HERBIE Command Dashboard data!");
  console.log("- 12 opportunities");
  console.log("- 6 bid projects");
  console.log("- 6 approval requests (5 pending, 1 approved)");
  console.log("- 5 teaming partners");
  console.log("- 5 knowledge documents");
  console.log("- 6 capture stages");
}
