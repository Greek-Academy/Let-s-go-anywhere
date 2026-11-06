export function SearchJourneyCar() {
  return (
    <svg className="journey-car" viewBox="0 0 80 52" aria-hidden="true">
      <g className="journey-car-body">
        <ellipse cx="42" cy="46" rx="33" ry="3" fill="#526846" opacity=".08" />
        <path
          d="M9 19c1-7 6-13 15-13h25c5 0 9 3 12 8l8 10 6 3v14H5V27c0-4 1-6 4-8Z"
          fill="#edcf8d"
        />
        <path d="M14 19c1-6 4-9 11-9h13v15H12Zm29-9h7c4 0 7 3 10 8l4 7H43Z" fill="#bdd7d3" />
        <path
          d="M17 13c4-2 8-2 11-2"
          stroke="#f5faf1"
          strokeWidth="2"
          strokeLinecap="round"
          opacity=".8"
        />
        <path d="M8 27h64v13H8" fill="#e9bf77" />
        <path d="M40 11v27" stroke="#d6aa63" strokeWidth="1" />
        <path d="M45 29h7" stroke="#997f59" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="6" y="30" width="4" height="5" rx="1" fill="#d68e76" />
        <rect x="69" y="28" width="6" height="5" rx="2" fill="#fff8d6" />
        <path d="M4 40h73" stroke="#e1e4cd" strokeWidth="4" strokeLinecap="round" />
        <rect x="24" y="1" width="24" height="6" rx="2" fill="#709985" />
        <path d="M28 1v6m15-6v6" stroke="#dbe4c8" strokeWidth="2" />
        <circle cx="20" cy="41" r="8" fill="#43554d" />
        <circle cx="62" cy="41" r="8" fill="#43554d" />
        <g fill="#cbd6bd">
          <circle cx="20" cy="41" r="4" />
          <circle cx="62" cy="41" r="4" />
        </g>
        <g className="journey-wheel-spokes" stroke="#7c9083">
          <path d="M20 38v6m-3-3h6" />
        </g>
        <g className="journey-wheel-spokes" stroke="#7c9083">
          <path d="M62 38v6m-3-3h6" />
        </g>
      </g>
    </svg>
  )
}
