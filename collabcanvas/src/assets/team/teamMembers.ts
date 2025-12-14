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
}

export const teamMembers: TeamMember[] = [
  {
    name: "Kalin Ivanov",
    role: "Co-Founder & CEO",
    image: kalinImg,
    desc: "",
  },
  {
    name: "Yahav Corcos",
    role: "Co-Founder & COO",
    image: yahavImg,
    desc: "",
  },
  {
    name: "Ankit Rijal",
    role: "Co-Founder & CTO",
    image: ankitImg,
    desc: "",
  },
  {
    name: "Kishor Kashid",
    role: "Co-Founder & CFO",
    image: kishorImg,
    desc: "",
  },
  {
    name: "Atharva Sardar",
    role: "Co-Founder & CAIO",
    image: atharvaImg,
    desc: "Ash has been looking for him since 2025",
  },
  {
    name: "Sainatha Yatham",
    role: "Unpaid Intern",
    image: sainathaImg,
    desc: "",
  },
];
