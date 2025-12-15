// Team member configuration
// To add a new member: Add their image to images/, then add an object below

import kalinImg from "./images/kalin.jpeg";
import yahavImg from "./images/yahav.jpeg";
import ankitImg from "./images/ankit.jpeg";
import kishorImg from "./images/kishor.jpeg";
import atharvaImg from "./images/atharva.jpeg";
import sainathaImg from "./images/sainatha.jpeg";

export interface TeamMember {
  name: string;
  role: string;
  image: string;
  desc?: string;
  linkedin?: string;
}

export const teamMembers: TeamMember[] = [
  {
    name: "Kalin Ivanov",
    role: "Co-Founder & CEO",
    image: kalinImg,
    desc: "",
    linkedin: "https://www.linkedin.com/in/kalin-the-analyst/",
  },
  {
    name: "Yahav Corcos",
    role: "Co-Founder & COO",
    image: yahavImg,
    desc: "",
    linkedin: "https://www.linkedin.com/in/yahavcorcos/",
  },
  {
    name: "Ankit Rijal",
    role: "Co-Founder & CTO",
    image: ankitImg,
    desc: "",
    linkedin: "https://www.linkedin.com/in/ankitrjl2054/",
  },
  {
    name: "Kishor Kashid",
    role: "Co-Founder & CFO",
    image: kishorImg,
    desc: "",
    linkedin: "https://www.linkedin.com/in/kishor-kashid/",
  },
  {
    name: "Atharva Sardar",
    role: "Co-Founder & CAIO",
    image: atharvaImg,
    desc: "",
    linkedin: "https://www.linkedin.com/in/atharva-sardar-983349192/",
  },
  {
    name: "Sainatha Yatham",
    role: "CIO",
    image: sainathaImg,
    desc: "",
    linkedin: "https://www.linkedin.com/in/sainathayatham/",
  },
];
